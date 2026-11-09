import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { getMyArchive } from "../../../lib/archives";
import { getActiveSuspension } from "../../../lib/profile";
import { applyAppearance, clearAppearance, fetchAppearance, forgetAppearance, readSavedAppearance, rememberAppearance } from "../../../lib/appearance";
import { countUnreadNotifications } from "../../../lib/notifications";
import { getNewApplicants } from "../../../lib/applications";
import { hangUp, listenForCalls } from "../../../lib/calls";
import { startPresenceHeartbeat } from "../../../lib/presence";

// The signed-in person as last loaded in this browser tab. The dashboard home
// (/dashboard-freelancer, /dashboard-client) and the other dashboard pages are
// separate routes, so moving between them builds a fresh frame and runs this
// hook again. Starting from these values instead of empty ones shows that frame
// at once, with the right name, picture and role, instead of the loading screen
// and "User"; it also gives the page wipe (styles/transitions.css) the real page
// to uncover. The checks below still run every time and replace these values.
// Forgotten when the person signs out or is sent to another page.
let lastShell = null;
// Whether the side menu was closed, so a fresh frame keeps the menu as it was.
let menuClosed = true;
function forgetShell() {
  lastShell = null;
  menuClosed = true;
}

// Everything the freelancer and client dashboard shells have in common:
// the signed-in session (and redirect-to-login guard), the sidebar
// collapse/theme body classes, and the toast/preview/chat/sign-out
// behaviors used across both. Pulled out of the old single DashboardLayout
// so FreelancerDashboardLayout and ClientDashboardLayout can each own their
// own nav/sidebar markup without duplicating this logic.
export function useDashboardShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(() => lastShell?.displayName ?? "User");
  // null until the session loads -- defaulting this to either role caused a
  // visible flash of the wrong dashboard when navigating between the
  // separate /dashboard, /dashboard-freelancer, and /dashboard-client route
  // trees, each of which mounts its own fresh instance of this hook. (The role
  // this tab already knows is used at once when there is one: see lastShell.)
  const [accountType, setAccountType] = useState(() => lastShell?.accountType ?? null);
  const [currentUserId, setCurrentUserId] = useState(() => lastShell?.currentUserId ?? null);
  // The signed-in user's @username (shown faintly over their own portfolio slides).
  const [username, setUsername] = useState(() => lastShell?.username ?? "");
  // Where the signed-in user's profile picture is in the avatars bucket
  // ("" = no picture). Settings updates it after an upload.
  const [avatarPath, setAvatarPath] = useState(() => lastShell?.avatarPath ?? "");
  // Number on the chat icon in the top bar: messages not read yet.
  const [unreadCount, setUnreadCount] = useState(0);
  // Number on the bell in the top bar: announcements and the user's own
  // notifications not read yet.
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  // The user's suspension while it's in effect (null = none). Pages use it
  // to disable posting / messaging; the layouts show a banner.
  const [suspension, setSuspension] = useState(() => lastShell?.suspension ?? null);
  // True while the profile has no name (people who signed up before names were
  // required): MissingNameDialog asks for one over every page.
  const [nameMissing, setNameMissing] = useState(() => lastShell?.nameMissing ?? false);
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
    // On a phone the menu covers the page, so close it once a link is tapped.
    document.body.classList.remove("sidebar-open");
  }, [location.pathname]);

  useEffect(() => {
    // dashboard.css targets body.fixed-layout / body.sidebar-collapsed / body.sidebar-open
    // directly, so those classes belong on the real <body>, not a wrapper div.
    // Sidebar starts collapsed so the menu is closed right after logging in;
    // the hamburger button (toggleSidebar) opens it.
    // A fresh frame (after moving between the dashboard home and another page)
    // keeps the menu as the person left it (menuClosed, top of this file).
    document.body.classList.add("fixed-layout");
    document.body.classList.toggle("sidebar-collapsed", menuClosed);
    return () => {
      if (lastShell) menuClosed = document.body.classList.contains("sidebar-collapsed");
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

  // Settings > Appearance (lib/appearance.js): the user's own accent color and
  // dark or light mode. The look this browser remembers goes on before the
  // page is first drawn (useLayoutEffect), so the usual colors don't show for
  // a moment first. It comes off again when leaving the dashboard, because
  // the login page and homepage keep the usual look.
  useLayoutEffect(() => {
    applyAppearance(readSavedAppearance());
    return clearAppearance;
  }, []);

  // Then the look saved on the profile is loaded, in case it was changed on
  // another device. If it can't be loaded, the remembered one stays.
  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;
    fetchAppearance(currentUserId).then((saved) => {
      if (!active || !saved) return;
      rememberAppearance(saved);
      applyAppearance(saved);
    });
    return () => { active = false; };
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        forgetShell();
        navigate("/login", { replace: true });
        return;
      }
      const meta = session.user.user_metadata || {};
      // A quick first value while the profile loads; the saved name from
      // profiles (below) replaces it. Not needed when this tab already knows
      // the person (lastShell): their saved name is already showing.
      if (lastShell?.currentUserId !== session.user.id) {
        setDisplayName(meta.full_name || meta.username || session.user.email || "User");
      }
      setCurrentUserId(session.user.id);

      // profiles.account_type is the source of truth (it's what RLS checks
      // and what switchRole updates first) -- reading it here instead of
      // session.user.user_metadata means the dashboard can't show the wrong
      // role if the two ever fall out of sync.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("account_type, username, full_name, avatar_path")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!active) return;

      // Signed in but no profile yet (e.g. a first Google sign-in): the
      // dashboard can't work without one, so finish the account first.
      if (!profileError && !profile) {
        forgetShell();
        navigate("/complete-profile", { replace: true });
        return;
      }

      // Archived (even while already logged in): the "archived" page is the only
      // page they can use (see resolvePostAuthRoute).
      const archive = await getMyArchive(session.user.id);
      if (!active) return;
      if (archive) {
        forgetShell();
        navigate("/archived", { replace: true });
        return;
      }

      // Banned (even while already logged in): send them to the appeal page,
      // which is the only page a banned user can use (see resolvePostAuthRoute).
      // Suspended users stay, with posting and/or messaging blocked.
      const activeSuspension = await getActiveSuspension(session.user.id);
      if (!active) return;
      if (activeSuspension && !activeSuspension.ends_at) {
        forgetShell();
        navigate("/appeal", { replace: true });
        return;
      }
      // A fresh load (the splash showed, nothing remembered yet): the page area
      // rises in while the splash fades (body.pf-arriving, styles/transitions.css).
      if (!lastShell) {
        document.body.classList.add("pf-arriving");
        window.setTimeout(() => document.body.classList.remove("pf-arriving"), 1200);
      }
      // In a React transition, so the switch from the loading splash to the
      // dashboard plays the sign-in opening (the splash's logo flies into the
      // top bar, styles/transitions.css).
      startTransition(() => {
        setSuspension(activeSuspension);

        // Client is the default role: only an explicit "freelancer" record
        // switches the dashboard to the freelancer view.
        setAccountType(profile?.account_type === "freelancer" ? "freelancer" : "client");
        setUsername(profile?.username || "");
        // profiles.full_name is the name saved in Settings, so a changed name
        // stays after a refresh. The username is the fallback if it's empty.
        setDisplayName(profile?.full_name || profile?.username || meta.full_name || session.user.email || "User");
        setAvatarPath(profile?.avatar_path || "");
        setNameMissing(!!profile && !(profile.full_name || "").trim());
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) return;
      // Signed out: the next person on this browser starts with the usual look.
      forgetAppearance();
      forgetShell();
      navigate("/login", { replace: true });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate]);

  // Keeps lastShell up to date, also after a change in Settings (name, picture).
  useEffect(() => {
    if (accountType === null || !currentUserId) return;
    lastShell = { currentUserId, accountType, displayName, username, avatarPath, suspension, nameMissing };
  }, [currentUserId, accountType, displayName, username, avatarPath, suspension, nameMissing]);

  // Real unread count (replaces the old hardcoded Inbox badge), refreshed on
  // load and whenever any message the RLS lets this user see gets inserted.
  // ChatView also calls this right after marking a conversation read, so the
  // badge drops immediately instead of waiting on the next insert.
  const refreshUnreadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_unread_message_count");
    if (!error) setUnreadCount(data ?? 0);
  }, []);

  // kind (optional): a message that is still waiting gets a moving picture
  // ("ping" while a payment is checked, Busy in components/Loaders.jsx).
  const showToast = useCallback((message, kind) => {
    setToast({ message, kind, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Online / offline status: tells the database "I'm here" once a minute
  // while any dashboard page is open (lib/presence.js).
  useEffect(() => {
    if (!currentUserId) return undefined;
    return startPresenceHeartbeat();
  }, [currentUserId]);

  // System-wide "new message" handling: refreshes the badge, marks the
  // message delivered (this client is what just received it, regardless of
  // which page is open), and pops a toast -- unless the person is already
  // looking at that exact conversation, where the message just appearing in
  // the chat is feedback enough.
  useEffect(() => {
    if (!currentUserId) return;

    // Catches up on anything sent while this device was offline -- the
    // realtime INSERT handler below only fires for messages that arrive
    // while it's actively subscribed. (.then() is what actually sends it;
    // without it Supabase never runs the call.)
    supabase.rpc("mark_messages_delivered").then(() => {});

    const channel = supabase
      .channel(`unread-messages:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        refreshUnreadCount();
        if (payload.new.sender_id === currentUserId) return;

        await supabase.rpc("mark_messages_delivered");

        const isViewingThisChat = pathnameRef.current === `/dashboard/chat/${payload.new.conversation_id}`;
        if (isViewingThisChat) return;

        // Call lines ("Video call, 3:12"): only a missed call gets a pop-up,
        // since the person was there for the others.
        const isCallLine = Boolean(payload.new.call_id);
        if (isCallLine && !payload.new.body?.startsWith("Missed")) return;

        const { data: sender } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", payload.new.sender_id)
          .maybeSingle();
        const name = sender?.full_name || sender?.username || "Someone";
        const contentLabel = payload.new.attachment_type === "video" ? "a video"
          : payload.new.attachment_type === "image" ? "a photo"
          : payload.new.attachment_type === "file" ? "a file"
          : payload.new.attachment_type === "audio" ? "a voice message"
          : "a message";
        showToast(isCallLine ? `${payload.new.body} from ${name}` : `${name} sent ${contentLabel}`);
      })
      .subscribe();

    refreshUnreadCount();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshUnreadCount, showToast]);

  // NotificationsView also calls this right after marking everything read,
  // so the badge drops back to 0.
  const refreshUnreadNotifications = useCallback(async () => {
    if (!currentUserId) return;
    setUnreadNotifications(await countUnreadNotifications(currentUserId));
  }, [currentUserId]);

  // The number on a freelancer's Bookings link: booking requests still waiting
  // for their answer (read under the database's own booking rules; clients get
  // no number). It is counted again when a notification arrives, when the
  // person moves to another page, and when the Bookings page asks (after an
  // Accept or Decline, which bumps bookingsTick).
  const [pendingBookings, setPendingBookings] = useState(0);
  const [bookingsTick, setBookingsTick] = useState(0);
  const refreshPendingBookings = useCallback(() => setBookingsTick((n) => n + 1), []);

  useEffect(() => {
    if (!currentUserId || accountType !== "freelancer") return undefined;
    let active = true;

    // head: true = just the count, no rows.
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("freelancer_id", currentUserId)
      .eq("status", "pending")
      .then(({ count }) => {
        if (active) setPendingBookings(count || 0);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, accountType, unreadNotifications, bookingsTick, location.pathname]);

  // The number on a client's "Projects & Resumes" link: applicants they haven't
  // opened yet (PLAN-notifications.md, Step N1). Counted again when a
  // notification arrives (every new applicant brings one), when the person
  // moves to another page, and when the Applications box marks some as seen
  // (refreshNewApplicants). Freelancers get no number.
  const [newApplicants, setNewApplicants] = useState(0);
  const [applicantsTick, setApplicantsTick] = useState(0);
  const refreshNewApplicants = useCallback(() => setApplicantsTick((n) => n + 1), []);

  useEffect(() => {
    if (!currentUserId || accountType !== "client") return undefined;
    let active = true;

    getNewApplicants(currentUserId).then(({ data, error }) => {
      if (active) setNewApplicants(error ? 0 : data.length);
    });

    return () => {
      active = false;
    };
  }, [currentUserId, accountType, unreadNotifications, applicantsTick, location.pathname]);

  // A new announcement or personal notification updates the badge and pops a
  // toast. The database rules only send each user the ones meant for them.
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements" }, (payload) => {
        refreshUnreadNotifications();
        showToast(`New announcement: ${payload.new.title}`);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${currentUserId}` }, async (payload) => {
        refreshUnreadNotifications();
        showToast(`New notification: ${payload.new.title}`);
        // Suspended while online: show the banner and block posting / chat
        // right away, without a refresh.
        if (payload.new.type === "suspension") setSuspension(await getActiveSuspension(currentUserId));
      })
      .subscribe();

    refreshUnreadNotifications();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshUnreadNotifications, showToast]);

  // Incoming voice/video calls ring on every dashboard page, and the current
  // call hears when it's answered or ended (see lib/calls.js). Moving to
  // another layout stops this listener for a moment; the call itself keeps
  // going and catches up.
  useEffect(() => {
    if (!currentUserId) return undefined;
    return listenForCalls(currentUserId);
  }, [currentUserId]);

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
      // The database says why when someone has started too many new chats today.
      showToast(error?.message?.includes("new chats today") ? error.message : "Couldn't start that conversation.");
      return;
    }
    navigate(`/dashboard/chat/${conversationId}`);
  }, [navigate, showToast, currentUserId]);

  const handleSignOut = useCallback(async (event) => {
    event.preventDefault();
    await hangUp(undefined, "signed_out"); // a call in progress ends with the session
    await supabase.auth.signOut();
    forgetShell();
    navigate("/login", { replace: true });
  }, [navigate]);

  // Lets a signed-in user flip their account between freelancer and client.
  // Updates both the `profiles` row (what RLS checks on insert -- e.g.
  // "services: freelancers can insert own") and the auth user_metadata
  // (what decides which dashboard shell renders), then sends them to their
  // new role's dashboard so the switch is immediately visible.
  //
  // targetType is optional: the account menu's single toggle omits it (always
  // flips to the other role); a caller may also name the role to switch to.
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

    // The fresh frame of the other dashboard starts with the new role.
    if (lastShell) lastShell = { ...lastShell, accountType: nextType };
    navigate(nextType === "client" ? "/dashboard-client" : "/dashboard-freelancer", { replace: true });
  }, [accountType, currentUserId, navigate, showToast, requestRoleConfirm]);

  const toggleSidebar = useCallback(() => {
    const cls = window.innerWidth < 992 ? "sidebar-open" : "sidebar-collapsed";
    document.body.classList.toggle(cls);
  }, []);

  // Tapping the dark area beside the open phone menu closes it.
  const closeSidebar = useCallback(() => {
    document.body.classList.remove("sidebar-open");
  }, []);

  // The name was just saved in the pop-up: show it and let them in.
  const handleNameSaved = useCallback((name) => {
    setDisplayName(name);
    setNameMissing(false);
  }, []);

  return {
    nameMissing, handleNameSaved,
    displayName, setDisplayName, accountType, currentUserId, username, setUsername,
    avatarPath, setAvatarPath,
    unreadCount, refreshUnreadCount,
    unreadNotifications, refreshUnreadNotifications,
    pendingBookings, refreshPendingBookings,
    newApplicants, refreshNewApplicants,
    suspension,
    toast, closeToast, showToast,
    preview, openPreview, closePreview,
    roleConfirm, resolveRoleConfirm,
    openChat, handleSignOut, switchRole, toggleSidebar, closeSidebar
  };
}
