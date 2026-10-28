import { NavLink, Outlet, useLocation } from "react-router-dom";
import DashboardTopNav from "../components/DashboardTopNav";
import DashboardOverlays from "../components/DashboardOverlays";
import SuspensionBanner from "../components/SuspensionBanner";
import DashboardBillboard from "../components/DashboardBillboard";
import DashboardMemberAds from "../components/DashboardMemberAds";
import GetStartedCard from "../components/GetStartedCard";
import WelcomeBanner from "../components/WelcomeBanner";
import Avatar from "../../../components/Avatar";
import ProBadge from "../../../components/ProBadge";
import { useProStatus } from "../../../lib/pro";
import "../dashboard.css";
import "../theme.css";

// Profile and Settings are not here: they are in the account menu at the top
// right, and the name card below opens the profile (one way to reach each page).
// Inbox and Notifications aren't either: they are the chat icon and the bell
// in the top bar.
// tour: the name the opening tour points at (components/WelcomeGuide.jsx).
const sidebarLinks = [
  { to: "/dashboard-client", end: true, icon: "bi-speedometer2", label: "Dashboard", tour: "menu-home" },
  { to: "/dashboard/bookings", icon: "bi-calendar-check-fill", label: "Bookings", tour: "menu-bookings" },
  { to: "/dashboard/post-need", icon: "bi-plus-circle-fill", label: "Post a Project", tour: "menu-post" },
  { to: "/dashboard/projects", icon: "bi-folder-fill", label: "Projects & Resumes", tour: "menu-projects" },
  // Premium, for clients too (PLAN-premium.md).
  { to: "/dashboard/pro", icon: "bi-gem", label: "Premium", tour: "menu-pro" },
  // The person's own paid ads on the Community Billboard (PLAN-community-billboard.md).
  { to: "/dashboard/advertise", icon: "bi-megaphone-fill", label: "Advertise", tour: "menu-advertise" }
  // (AI Moodboard Matching has no link here: it is the camera button in the
  // search box, see DashboardTopNav.jsx.)
];

// Receives the shared session/toast/preview/chat state as props from
// DashboardLayout (which calls useDashboardShell() once) rather than
// calling the hook itself, so the auth session isn't fetched twice.
export default function ClientDashboardLayout({
  nameMissing, handleNameSaved,
  displayName, setDisplayName, accountType, currentUserId, username,
  avatarPath, setAvatarPath,
  unreadCount, refreshUnreadCount,
  unreadNotifications, refreshUnreadNotifications,
  suspension,
  toast, closeToast, showToast,
  preview, openPreview, closePreview,
  roleConfirm, resolveRoleConfirm,
  openChat, handleSignOut, switchRole, toggleSidebar, closeSidebar
}) {
  // The welcome banner belongs on the dashboard home only, not every
  // sub-page (chat, inbox, profile, ...) that reuses this same layout.
  const isDashboardHome = useLocation().pathname === "/dashboard-client";
  // Whether this client has Premium right now: the gold Premium badge by their
  // name (menu and top bar) and "Active" on the menu item. The Premium page
  // calls refreshPro after a payment.
  const pro = useProStatus(currentUserId);
  const isPro = Boolean(pro.until);

  return (
    <div className="bg-dark text-light">
      <DashboardTopNav displayName={displayName} avatarPath={avatarPath} accountType={accountType} currentUserId={currentUserId} unreadMessages={unreadCount} unreadNotifications={unreadNotifications} onNotificationsRead={refreshUnreadNotifications} onToggleSidebar={toggleSidebar} onSignOut={handleSignOut} onSwitchRole={switchRole} showToast={showToast} openChat={openChat} isPro={isPro} />

      <div className="app-container d-flex">
        <aside data-tour="sidebar" className="sidebar-wrapper border-end border-secondary border-opacity-25" id="appSidebar">
          <div className="sidebar-inner d-flex flex-column justify-content-between h-100 py-3 px-2">
            <div className="nav flex-column gap-2">
              <NavLink to="/dashboard/profile" className="sidebar-identity text-decoration-none" title="My profile">
                <Avatar path={avatarPath} name={displayName} size={40} />
                <div className="d-flex flex-column overflow-hidden">
                  <span className="text-white fw-bold fs-7 text-truncate">{displayName}</span>
                  <span className="d-flex align-items-center gap-1">
                    <span className="role-badge">Client</span>
                    <ProBadge pro={isPro} />
                  </span>
                </div>
              </NavLink>

              {sidebarLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  data-tour={link.tour}
                  className={({ isActive }) => `sidebar-pill-btn${isActive ? " active" : ""}`}
                >
                  <i className={`bi ${link.icon}`}></i>
                  <span>{link.label}</span>
                  {/* Premium says "Active" while the person has it. */}
                  {link.to === "/dashboard/pro" && isPro && <span className="badge bg-warning text-dark rounded-pill ms-auto">Active</span>}
                </NavLink>
              ))}
            </div>

            <div className="sidebar-footer px-3 pt-3 border-top border-secondary border-opacity-25 fs-8 text-secondary">
              <p className="mb-1 fw-semibold text-white-50">PhilFreela Dashboard</p>
              <small>© 2026 Version 2.0</small>
            </div>
          </div>
        </aside>
        {/* Only shows on phones while the menu is open; tapping it closes the menu. */}
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true"></div>

        <main className="content-wrapper flex-grow-1 p-3 p-md-4">
          <SuspensionBanner suspension={suspension} />

          {/* "Welcome, Name", plus "a thoughtful client looking for a Video Editor" from their
              open job posts. No buttons: Post a Project and Projects & Resumes are in the sidebar. */}
          {isDashboardHome && <WelcomeBanner displayName={displayName} userId={currentUserId} isClient />}

          {/* The checklist for a new account: what to do first (hides itself when done). */}
          {isDashboardHome && <GetStartedCard userId={currentUserId} accountType={accountType} />}

          {/* What an admin posted for this user (admin panel > Billboard). */}
          {isDashboardHome && <DashboardBillboard />}
          {isDashboardHome && <DashboardMemberAds />}

          <Outlet context={{ displayName, setDisplayName, avatarPath, setAvatarPath, accountType, currentUserId, username, showToast, openChat, openPreview, refreshUnreadCount, unreadNotifications, refreshUnreadNotifications, suspension, isPro, refreshPro: pro.reload }} />
        </main>
      </div>

      <DashboardOverlays preview={preview} onClosePreview={closePreview} toast={toast} onCloseToast={closeToast} roleConfirm={roleConfirm} onResolveRoleConfirm={resolveRoleConfirm} nameMissing={nameMissing} userId={currentUserId} accountType={accountType} onNameSaved={handleNameSaved} onSignOut={handleSignOut} />
    </div>
  );
}
