import { NavLink, Outlet, useLocation } from "react-router-dom";
import DashboardTopNav from "../components/DashboardTopNav";
import DashboardOverlays from "../components/DashboardOverlays";
import SuspensionBanner from "../components/SuspensionBanner";
import DashboardBillboard from "../components/DashboardBillboard";
import GetStartedCard from "../components/GetStartedCard";
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
  { to: "/dashboard-freelancer", end: true, icon: "bi-speedometer2", label: "Dashboard", tour: "menu-home" },
  { to: "/dashboard/services", icon: "bi-briefcase-fill", label: "My Services", tour: "menu-services" },
  { to: "/dashboard/bookings", icon: "bi-calendar-check-fill", label: "Bookings", tour: "menu-bookings" },
  { to: "/dashboard/projects", icon: "bi-folder-fill", label: "Project", tour: "menu-projects" },
  // Freelancer Pro's own page (it used to be a Settings tab).
  { to: "/dashboard/pro", icon: "bi-gem", label: "Freelancer Pro", tour: "menu-pro" }
];

// Receives the shared session/toast/preview/chat state as props from
// DashboardLayout (which calls useDashboardShell() once) rather than
// calling the hook itself, so the auth session isn't fetched twice.
export default function FreelancerDashboardLayout({
  nameMissing, handleNameSaved,
  displayName, setDisplayName, accountType, currentUserId, username,
  avatarPath, setAvatarPath,
  unreadCount, refreshUnreadCount,
  unreadNotifications, refreshUnreadNotifications,
  pendingBookings, refreshPendingBookings,
  suspension,
  toast, closeToast, showToast,
  preview, openPreview, closePreview,
  roleConfirm, resolveRoleConfirm,
  openChat, handleSignOut, switchRole, toggleSidebar, closeSidebar
}) {
  // The welcome banner belongs on the dashboard home only, not every
  // sub-page (chat, inbox, profile, ...) that reuses this same layout.
  const isDashboardHome = useLocation().pathname === "/dashboard-freelancer";
  // Whether this freelancer has Pro right now: the gold Pro badge by their name
  // and "Active" on the menu item. The Pro page calls refreshPro after a payment.
  const pro = useProStatus(currentUserId);
  const isPro = Boolean(pro.until);

  return (
    <div className="bg-dark text-light">
      <DashboardTopNav displayName={displayName} avatarPath={avatarPath} accountType={accountType} currentUserId={currentUserId} unreadMessages={unreadCount} unreadNotifications={unreadNotifications} onNotificationsRead={refreshUnreadNotifications} onToggleSidebar={toggleSidebar} onSignOut={handleSignOut} onSwitchRole={switchRole} showToast={showToast} />

      <div className="app-container d-flex">
        <aside data-tour="sidebar" className="sidebar-wrapper border-end border-secondary border-opacity-25" id="appSidebar">
          <div className="sidebar-inner d-flex flex-column justify-content-between h-100 py-3 px-2">
            <div className="nav flex-column gap-2">
              <NavLink to="/dashboard/profile" className="sidebar-identity text-decoration-none" title="My profile">
                <Avatar path={avatarPath} name={displayName} size={40} />
                <div className="d-flex flex-column overflow-hidden">
                  <span className="text-white fw-bold fs-7 text-truncate">{displayName}</span>
                  <span className="d-flex align-items-center gap-1">
                    <span className="role-badge">Freelancer</span>
                    <ProBadge pro={isPro} />
                  </span>
                </div>
              </NavLink>

              {sidebarLinks.map((link) => {
                // Live count: booking requests waiting for an answer on Bookings.
                const count = link.to === "/dashboard/bookings" ? pendingBookings : 0;
                // Freelancer Pro says "Active" while the person has it.
                const isProLink = link.to === "/dashboard/pro";
                const badge = isProLink ? (isPro ? "Active" : null) : count > 0 ? String(count) : null;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    data-tour={link.tour}
                    className={({ isActive }) => `sidebar-pill-btn${isActive ? " active" : ""}`}
                  >
                    <i className={`bi ${link.icon}`}></i>
                    <span>{link.label}</span>
                    {badge && <span className="badge bg-warning text-dark rounded-pill ms-auto">{badge}</span>}
                  </NavLink>
                );
              })}
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

          {isDashboardHome && (
            <div className="welcome-banner glass-card p-3 p-md-4 rounded-4 mb-3 mb-md-4 border border-secondary border-opacity-25 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 gap-md-3">
              <div>
                {/* The tag and the line under the name are left out on a phone, so the cards below come into view sooner. */}
                <span className="badge bg-orange-subtle text-orange px-3 py-1 rounded-pill fw-bold text-uppercase fs-8 mb-2 d-none d-md-inline-block">PHILFREELA PORTAL</span>
                <h1 className="welcome-title h2 text-white mb-1">Welcome, {displayName}</h1>
                <p className="text-secondary mb-0 fs-7 d-none d-md-block">
                  Manage your freelance portfolio, job proposals, messages, and settings seamlessly.
                </p>
              </div>
              {/* No buttons: this page is already the list of jobs, and the
                  sidebar has My Services and Project. */}
            </div>
          )}

          {/* The checklist for a new account: what to do first (hides itself when done). */}
          {isDashboardHome && <GetStartedCard userId={currentUserId} accountType={accountType} />}

          {/* What an admin posted for this user (admin panel > Billboard). */}
          {isDashboardHome && <DashboardBillboard />}

          <Outlet context={{ displayName, setDisplayName, avatarPath, setAvatarPath, accountType, currentUserId, username, showToast, openChat, openPreview, refreshUnreadCount, unreadNotifications, refreshUnreadNotifications, refreshPendingBookings, suspension, isPro, refreshPro: pro.reload }} />
        </main>
      </div>

      <DashboardOverlays preview={preview} onClosePreview={closePreview} toast={toast} onCloseToast={closeToast} roleConfirm={roleConfirm} onResolveRoleConfirm={resolveRoleConfirm} nameMissing={nameMissing} userId={currentUserId} accountType={accountType} onNameSaved={handleNameSaved} onSignOut={handleSignOut} />
    </div>
  );
}
