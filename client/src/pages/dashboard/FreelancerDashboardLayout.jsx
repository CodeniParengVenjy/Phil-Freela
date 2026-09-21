import { NavLink, Outlet } from "react-router-dom";
import DashboardTopNav from "./DashboardTopNav";
import DashboardOverlays from "./DashboardOverlays";
import "./dashboard.css";

const sidebarLinks = [
  { to: "/dashboard-freelancer", end: true, icon: "bi-speedometer2", label: "Dashboard" },
  { to: "/dashboard/profile", icon: "bi-person-circle", label: "Profile" },
  { to: "/dashboard/inbox", icon: "bi-chat-left-text-fill", label: "Inbox", badge: "3", badgeClass: "bg-danger" },
  { to: "/dashboard/notifications", icon: "bi-bell-fill", label: "Notifications", badge: "2", badgeClass: "bg-warning text-dark" },
  { to: "/dashboard/projects", icon: "bi-folder-fill", label: "Project" },
  { to: "/dashboard/settings", icon: "bi-gear-fill", label: "Settings" }
];

// Receives the shared session/toast/preview/chat state as props from
// DashboardLayout (which calls useDashboardShell() once) rather than
// calling the hook itself, so the auth session isn't fetched twice.
export default function FreelancerDashboardLayout({
  displayName, setDisplayName, accountType, currentUserId,
  toast, closeToast, showToast,
  preview, openPreview, closePreview,
  roleConfirm, resolveRoleConfirm,
  openChat, handleSignOut, switchRole, toggleSidebar
}) {
  return (
    <div className="bg-dark text-light">
      <DashboardTopNav displayName={displayName} accountType={accountType} onToggleSidebar={toggleSidebar} onSignOut={handleSignOut} onSwitchRole={switchRole} />

      <div className="app-container d-flex">
        <aside className="sidebar-wrapper border-end border-secondary border-opacity-25" id="appSidebar">
          <div className="sidebar-inner d-flex flex-column justify-content-between h-100 py-3 px-2">
            <div className="nav flex-column gap-2">
              <div className="sidebar-identity">
                <span className="avatar-circle-sm bg-role text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, fontSize: "1rem" }}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <div className="d-flex flex-column overflow-hidden">
                  <span className="text-white fw-bold fs-7 text-truncate">{displayName}</span>
                  <span className="role-badge">Freelancer</span>
                </div>
              </div>

              {sidebarLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `sidebar-pill-btn${isActive ? " active" : ""}`}
                >
                  <i className={`bi ${link.icon}`}></i>
                  <span>{link.label}</span>
                  {link.badge && <span className={`badge ${link.badgeClass} rounded-pill ms-auto`}>{link.badge}</span>}
                </NavLink>
              ))}
            </div>

            <div className="sidebar-footer px-3 pt-3 border-top border-secondary border-opacity-25 fs-8 text-secondary">
              <p className="mb-1 fw-semibold text-white-50">PhilFreela Dashboard</p>
              <small>© 2026 Version 2.0</small>
            </div>
          </div>
        </aside>

        <main className="content-wrapper flex-grow-1 p-3 p-md-4">
          <div className="welcome-banner glass-card p-4 rounded-4 mb-4 border border-secondary border-opacity-25 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div>
              <span className="badge bg-orange-subtle text-orange px-3 py-1 rounded-pill fw-bold text-uppercase fs-8 mb-2">PHILFREELA PORTAL</span>
              <h1 className="welcome-title h2 text-white mb-1">Welcome, {displayName}</h1>
              <p className="text-secondary mb-0 fs-7">
                Manage your freelance portfolio, job proposals, messages, and settings seamlessly.
              </p>
            </div>
            <div className="d-flex align-items-center gap-2">
              <NavLink to="/dashboard/services" className="btn btn-outline-role rounded-pill px-3 py-2 fs-7 fw-bold">
                <i className="bi bi-plus-lg me-1"></i> Post Service
              </NavLink>
              <NavLink to="/dashboard/messages" className="btn btn-gradient-role rounded-pill px-3 py-2 fs-7 fw-bold text-white">
                <i className="bi bi-search me-1"></i> Find Jobs
              </NavLink>
            </div>
          </div>

          <Outlet context={{ displayName, setDisplayName, accountType, currentUserId, showToast, openChat, openPreview }} />
        </main>
      </div>

      <DashboardOverlays preview={preview} onClosePreview={closePreview} toast={toast} onCloseToast={closeToast} roleConfirm={roleConfirm} onResolveRoleConfirm={resolveRoleConfirm} />
    </div>
  );
}
