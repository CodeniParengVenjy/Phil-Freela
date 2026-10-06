import { supabase } from "./supabaseClient";

// Data Privacy Compliance (feature 6): "Download your data" and "Delete
// your account", the two parts of RA 10173's "user rights" principle that
// need code (viewing and downloading read the same rows a user's own
// dashboard pages already can, under the database's existing rules; only
// deleting needs its own database function, since a normal login can't
// delete the auth.users row directly).
//
// Left out on purpose: the raw ID photos and face scan behind identity
// verification (only its status and date are included), and the full text
// of messages (only a summary, since a message also belongs to whoever you
// sent it to or got it from).

// Everything PhilFreela has about one user, as one plain object -- built
// straight from the tables their own dashboard already reads, so this adds
// no new storage or database function.
export async function exportMyData(userId) {
  const [profile, verification, services, jobPosts, portfolioItems, applications, projects, bookings, ratingsGiven, ratingsReceived, conversations] =
    await Promise.all([
      supabase.from("profiles").select("full_name, username, gender, account_type, description, skills, avatar_path, email_when_offline, created_at, updated_at").eq("id", userId).maybeSingle(),
      supabase.from("identity_verifications").select("id_type, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("services").select("id, title, category, description, price, skill, created_at").eq("freelancer_id", userId),
      supabase.from("job_posts").select("id, title, category, description, budget, due_date, created_at").eq("client_id", userId),
      supabase.from("portfolio_items").select("id, title, description, category, tags, created_at").eq("freelancer_id", userId),
      supabase.from("job_applications").select("id, job_post_id, cover_note, created_at").eq("freelancer_id", userId),
      // (A project has started_at, not created_at: asking for a column that
      // isn't there made this whole request fail and the list come out empty.)
      supabase.from("projects").select("id, title, status, client_id, freelancer_id, started_at, due_date, completed_at").or(`client_id.eq.${userId},freelancer_id.eq.${userId}`),
      supabase.from("bookings").select("id, title, status, client_id, freelancer_id, due_date, created_at, responded_at").or(`client_id.eq.${userId},freelancer_id.eq.${userId}`),
      supabase.from("project_ratings").select("project_id, stars, feedback, created_at").eq("rater_id", userId),
      supabase.from("project_ratings").select("project_id, stars, feedback, created_at").eq("ratee_id", userId),
      messageSummary(userId)
    ]);

  return {
    exported_at: new Date().toISOString(),
    about_this_file:
      "Everything PhilFreela has about your account, under the Philippine Data Privacy Act (RA 10173). " +
      "Your government ID photos and face scan are kept only for identity verification and are not included here " +
      "(only the result is). Messages are summarized, not shown in full, since a message also belongs to the person you sent it to or received it from.",
    profile: profile.data,
    identity_verifications: verification.data || [],
    services: services.data || [],
    job_posts: jobPosts.data || [],
    portfolio_items: portfolioItems.data || [],
    job_applications: applications.data || [],
    projects: projects.data || [],
    bookings: bookings.data || [],
    ratings_you_gave: ratingsGiven.data || [],
    ratings_you_received: ratingsReceived.data || [],
    conversations: conversations
  };
}

// Who you've messaged, and how many messages each way -- not the messages
// themselves (see the note above).
async function messageSummary(userId) {
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, created_at, a:profiles!conversations_user_a_fkey(username), b:profiles!conversations_user_b_fkey(username), user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  return Promise.all((conversations || []).map(async (conversation) => {
    const otherUsername = conversation.user_a === userId ? conversation.b?.username : conversation.a?.username;
    const [sent, received] = await Promise.all([
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id).eq("sender_id", userId),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation.id).neq("sender_id", userId)
    ]);
    return { with: otherUsername || "(deleted account)", started: conversation.created_at, messages_sent: sent.count || 0, messages_received: received.count || 0 };
  }));
}

// Saves the file straight from the browser; nothing is sent anywhere else.
export function downloadAsFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Deletes the signed-in user's account and everything that belongs to it
// (profile, posts, portfolio, messages, and so on cascade with it). There's
// no going back from this -- the caller should already have a confirmation
// step before calling it.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
