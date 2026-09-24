import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getSuspensionReason } from "../../../lib/profile";
import { countUnreadAnnouncements } from "../../../lib/announcements";

// Everything the freelancer and client dashboard shells have in common:
// the signed-in session (and redirect-to-login guard), the sidebar
// collapse/theme body classes, and the toast/preview/chat/sign-out
// behaviors used across both. Pulled out of the old single DashboardLayout
// so FreelancerDashboardLayout and ClientDashboardLayout can each own their
// own nav/sidebar markup without duplicating this logic.
export function useDashboardShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState("User");
  // null until the session loads -- defaulting this to either role caused a
  // visible flash of the wrong dashboard when navigating between the
  // separate /dashboard, /dashboard-freelancer, and /dashboard-client route
  // trees, each of which mounts its own fresh instance of this hook.
  const [accountType, setAccountType] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Number on the Notifications link: admin announcements not read yet.
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [toast, setToast] = useState({ message: "", visible: false });
  const [preview, setPreview] = useState({ src: "", title: "", visible: false });
  const [roleConfirm, setRoleConfirm] = useState({ visible: false, nextType: null });
  const toastTimer = useRef(null);
  const roleConfirmResolveRef = useRef(null);
  // Read inside the realtime handler below instead of depending on
  // location.pathname directly -- that would tear down and resubscribe the
  // channel on every navigation, risking missed events during the churn.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    // dashboard.css targets body.fixed-layout / body.sidebar-collapsed / body.sidebar-open
    // directly, so those classes belong on the real <body>, not a wrapper div.
    // Sidebar starts collapsed so the menu is closed right after logging in;
    // the hamburger button (toggleSidebar) opens it.
    document.body.classList.add("fixed-layout", "sidebar-collapsed");
    return () => {
      document.body.classList.remove("fixed-layout", "sidebar-collapsed", "sidebar-open");
    };
  }, []);

  useEffect(() => {
    // Drives the --accent-role CSS variables (dashboard.css): orange for
    // freelancers, cyan for clients, so shared views (Inbox, Chat,
    // Notifications, Settings) visually pick up whichever role is signed
    // in instead of always reading as the freelancer side. Skipped while
    // accountType is still null (role not resolved yet) so it doesn't
    // briefly apply the wrong accent color.
    if (accountType === null) return undefined;
    document.body.classList.toggle("theme-client", accountType === "client");
    document.body.classList.toggle("theme-freelancer", accountType !== "client");
    return () => {
      document.body.classList.remove("theme-client", "theme-freelancer");
    };
  }, [accountType]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }
      const meta = session.user.user_metadata || {};
      setDisplayName(meta.full_name || meta.username || session.user.email || "User");
      setCurrentUserId(session.user.id);

      // profiles.account_type is the source of truth (it's what RLS checks
      // and what switchRole updates first) -- reading it here instead of
      // session.user.user_metadata means the dashboard can't show the wrong
      // role if the two ever fall out of sync.
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active) return;

      // Suspended while already logged in: send them to the login page,
      // which signs them out and shows the reason (see resolvePostAuthRoute).
      if (await getSuspensionReason(session.user.id)) {
        if (active) navigate("/login", { replace: true });
        return;
      }
      if (!active) return;

      // Client is the default role: only an explicit "freelancer" record
      // switches the dashboard to the freelancer view.
      setAccountType(profile?.account_type === "freelancer" ? "freelancer" : "client");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/login", { replace: true });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate]);

  // Real unread count (replaces the old hardcoded Inbox badge), refreshed on
  // load and whenever any message the RLS lets this user see gets inserted.
  // ChatView also calls this right after marking a conversation read, so the
  // badge drops immediately instead of waiting on the next insert.
  const refreshUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_unread_message_count");
    if (!error) setUnreadCount(data ?? 0);
  }, []);

  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // System-wide "new message" handling: refreshes the badge, marks the
  // message delivered (this client is what just received it, regardless of
  // which page is open), and pops a toast -- unless the person is already
  // looking at that exact conversation, where the message just appearing in
  // the chat is feedback enough.
  useEffect(() => {
    if (!currentUserId) return;

    // Catches up on anything sent while this device was offline -- the
    // realtime INSERT handler below only fires for messages that arrive
    // while it's actively subscribed.
    supabase.rpc("mark_messages_delivered");

    const channel = supabase
      .channel(`unread-messages:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        refreshUnreadCount();
        if (payload.new.sender_id === currentUserId) return;

        await supabase.rpc("mark_messages_delivered");

        const isViewingThisChat = pathnameRef.current === `/dashboard/chat/${payload.new.conversation_id}`;
        if (isViewingThisChat) return;

        const { data: sender } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", payload.new.sender_id)
          .maybeSingle();
        const name = sender?.full_name || sender?.username || "Someone";
        const contentLabel = payload.new.attachment_type === "video" ? "a video"
          : payload.new.attachment_type === "image" ? "a photo"
          : "a message";
        showToast(`${name} sent ${contentLabel}`);
      })
      .subscribe();

    refreshUnreadCount();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshUnreadCount, showToast]);

  // NotificationsView also calls this right after marking announcements
  // read, so the badge drops back to 0.
  const refreshUnreadAnnouncements = useCallback(async () => {
    if (!currentUserId) return;
    setUnreadAnnouncements(await countUnreadAnnouncements(currentUserId));
  }, [currentUserId]);

  // A new admin announcement updates the badge and pops a toast. The
  // database rules only send each user the announcements meant for them.
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`announcements:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, (payload) => {
        refreshUnreadAnnouncements();
        showToast(`New announcement: ${payload.new.title}`);
      })
      .subscribe();

    refreshUnreadAnnouncements();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshUnreadAnnouncements, showToast]);

  const openPreview = useCallback((src, title) => {
    setPreview({ src, title, visible: true });
  }, []);

  const closePreview = useCallback(() => {
    setPreview((prev) => ({ ...prev, visible: false }));
  }, []);

  // Replaces window.confirm's native browser dialog with an app-styled one
  // (rendered by DashboardOverlays). Resolves to true/false once the person
  // picks Cancel or Confirm in that modal.
  const requestRoleConfirm = useCallback((nextType) => {
    return new Promise((resolve) => {
      roleConfirmResolveRef.current = resolve;
      setRoleConfirm({ visible: true, nextType });
    });
  }, []);

  const resolveRoleConfirm = useCallback((confirmed) => {
    setRoleConfirm({ visible: false, nextType: null });
    roleConfirmResolveRef.current?.(confirmed);
    roleConfirmResolveRef.current = null;
  }, []);

  const openChat = useCallback(async (otherUserId) => {
    if (!otherUserId || otherUserId === currentUserId) {
      showToast("Can't start that conversation.");
      return;
    }
    const { data: conversationId, error } = await supabase.rpc("get_or_create_conversation", { other_id: otherUserId });
    if (error || !conversationId) {
      showToast("Couldn't start that conversation.");
      return;
    }
    navigate(`/dashboard/chat/${conversationId}`);
  }, [navigate, showToast, currentUserId]);

  const handleSignOut = useCallback(async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }, [navigate]);

  // Lets a signed-in user flip their account between freelancer and client.
  // Updates both the `profiles` row (what RLS checks on insert -- e.g.
  // "services: freelancers can insert own") and the auth user_metadata
  // (what decides which dashboard shell renders), then sends them to their
  // new role's dashboard so the switch is immediately visible.
  //
  // targetType is optional: the dropdown's single toggle button omits it
  // (always flips to the other role), while the "Join as Freelancer" /
  // "Become a Client" top-nav links pass their specific role explicitly so
  // they perform this same real switch instead of just changing the view.
  const switchRole = useCallback(async (event, targetType) => {
    event.preventDefault();
    if (!currentUserId) return;

    const nextType = targetType || (accountType === "client" ? "freelancer" : "client");
    if (nextType === accountType) return;

    const confirmed = await requestRoleConfirm(nextType);
    if (!confirmed) return;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ account_type: nextType })
      .eq("id", currentUserId);
    if (profileError) {
      showToast("Couldn't switch roles. Please try again.");
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({ data: { account_type: nextType } });
    if (authError) {
      showToast("Couldn't switch roles. Please try again.");
      return;
    }

    navigate(nextType === "client" ? "/dashboard-client" : "/dashboard-freelancer", { replace: true });
  }, [accountType, currentUserId, navigate, showToast, requestRoleConfirm]);

  const toggleSidebar = useCallback(() => {
    const cls = window.innerWidth < 992 ? "sidebar-open" : "sidebar-collapsed";
    document.body.classList.toggle(cls);
  }, []);

  return {
    displayName, setDisplayName, accountType, currentUserId,
    unreadCount, refreshUnreadCount,
    unreadAnnouncements, refreshUnreadAnnouncements,
    toast, closeToast, showToast,
    preview, openPreview, closePreview,
    roleConfirm, resolveRoleConfirm,
    openChat, handleSignOut, switchRole, toggleSidebar
  };
}
