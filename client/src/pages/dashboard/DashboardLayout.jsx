import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./dashboard.css";

const sidebarLinks = [
  { to: "/dashboard", end: true, icon: "bi-person-circle", label: "Profile" },
  { to: "/dashboard/messages", icon: "bi-briefcase-fill", label: "Messages / Jobs" },
  { to: "/dashboard/inbox", icon: "bi-chat-left-text-fill", label: "Inbox", badge: "3", badgeClass: "bg-danger" },
  { to: "/dashboard/notifications", icon: "bi-bell-fill", label: "Notifications", badge: "2", badgeClass: "bg-warning text-dark" },
  { to: "/dashboard/services", icon: "bi-plus-circle-fill", label: "Create Services" },
  { to: "/dashboard/projects", icon: "bi-folder-fill", label: "Projects & Resumes" },
  { to: "/dashboard/settings", icon: "bi-gear-fill", label: "Settings" }
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("User");
  const [chatRecipient, setChatRecipient] = useState("Juan Cruz");
  const [toast, setToast] = useState({ message: "", visible: false });
  const [preview, setPreview] = useState({ src: "", title: "", visible: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    // dashboard.css targets body.fixed-layout / body.sidebar-collapsed / body.sidebar-open
    // directly, so those classes belong on the real <body>, not a wrapper div.
    document.body.classList.add("fixed-layout");
    return () => {
      document.body.classList.remove("fixed-layout", "sidebar-collapsed", "sidebar-open");
    };
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }
      const meta = session.user.user_metadata || {};
      setDisplayName(meta.full_name || meta.username || session.user.email || "User");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/login", { replace: true });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate]);

  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 3000);
  }, []);

  const openPreview = useCallback((src, title) => {
    setPreview({ src, title, visible: true });
  }, []);

  const closePreview = useCallback(() => {
    setPreview((prev) => ({ ...prev, visible: false }));
  }, []);

  const openChat = useCallback((recipient) => {
    setChatRecipient(recipient);
    navigate("/dashboard/chat");
    showToast(`Opened conversation with ${recipient}`);
  }, [navigate, showToast]);

  const handleSignOut = async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="bg-dark text-light">
      <nav className="navbar navbar-expand-lg fixed-top border-bottom border-secondary border-opacity-25" id="topNavbar">
        <div className="container-fluid px-3 px-lg-4">
          <div className="d-flex align-items-center gap-3">
            <button
              className="btn btn-outline-secondary text-white border-0 shadow-none p-1"
              type="button"
              aria-label="Toggle Sidebar"
              onClick={() => {
                const cls = window.innerWidth < 992 ? "sidebar-open" : "sidebar-collapsed";
                document.body.classList.toggle(cls);
              }}
            >
              <i className="bi bi-list fs-2 text-warning"></i>
            </button>
            <NavLink to="/" className="navbar-brand d-flex align-items-center gap-2 m-0">
              <img src="/logo-philfreela.svg" alt="PhilFreela" className="logo-img" />
            </NavLink>
          </div>

          <div className="d-none d-md-flex mx-auto position-relative search-nav-box" style={{ width: 380 }}>
            <i className="bi bi-search search-icon text-secondary"></i>
            <input type="search" className="form-control nav-search-input" placeholder="Search profiles, jobs, inbox..." />
          </div>

          <div className="d-flex align-items-center gap-3">
            <NavLink to="/dashboard/services" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7">Join as Freelancer</NavLink>
            <NavLink to="/dashboard/messages" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7">Become a Client</NavLink>
            <NavLink to="/dashboard/services" className="nav-link text-white-50 hover-orange d-none d-lg-block fw-semibold fs-7">Services</NavLink>

            <div className="dropdown">
              <button className="btn btn-dark border border-secondary border-opacity-50 rounded-pill d-flex align-items-center gap-2 px-3 py-1 dropdown-toggle text-white" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                <span className="avatar-circle-sm bg-orange text-white fw-bold">{displayName.charAt(0).toUpperCase()}</span>
                <span className="fw-semibold fs-7 text-truncate d-none d-sm-inline">{displayName}</span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end dropdown-menu-dark border border-secondary border-opacity-25 shadow-lg p-2">
                <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard"><i className="bi bi-person me-2 text-orange"></i> My Profile</NavLink></li>
                <li><NavLink className="dropdown-item rounded-2 text-white" to="/dashboard/settings"><i className="bi bi-gear me-2 text-info"></i> Account Settings</NavLink></li>
                <li><hr className="dropdown-divider border-secondary border-opacity-25" /></li>
                <li><a className="dropdown-item rounded-2 text-danger" href="/login" onClick={handleSignOut}><i className="bi bi-box-arrow-right me-2"></i> Sign out</a></li>
              </ul>
            </div>
          </div>
        </div>
      </nav>

      <div className="app-container d-flex">
        <aside className="sidebar-wrapper border-end border-secondary border-opacity-25" id="appSidebar">
          <div className="sidebar-inner d-flex flex-column justify-content-between h-100 py-3 px-2">
            <div className="nav flex-column gap-2">
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
              <p className="text-secondary mb-0 fs-7">Manage your freelance portfolio, job proposals, messages, and settings seamlessly.</p>
            </div>
            <div className="d-flex align-items-center gap-2">
              <NavLink to="/dashboard/services" className="btn btn-outline-warning rounded-pill px-3 py-2 fs-7 fw-bold">
                <i className="bi bi-plus-lg me-1"></i> Post Service
              </NavLink>
              <NavLink to="/dashboard/messages" className="btn btn-gradient-orange rounded-pill px-3 py-2 fs-7 fw-bold text-white">
                <i className="bi bi-search me-1"></i> Find Jobs
              </NavLink>
            </div>
          </div>

          <Outlet context={{ displayName, setDisplayName, chatRecipient, showToast, openChat, openPreview }} />
        </main>
      </div>

      {preview.visible && (
        <div
          onClick={closePreview}
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
          }}
        >
          <div
            className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
            style={{ maxWidth: 640, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
              <h5 className="fw-bold mb-0">{preview.title}</h5>
              <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={closePreview}></button>
            </div>
            <div className="text-center">
              <img src={preview.src} className="img-fluid rounded-3 shadow-2xl" style={{ maxHeight: 500 }} alt="Preview" />
            </div>
          </div>
        </div>
      )}

      <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }}>
        <div className={`toast align-items-center text-white bg-orange border-0${toast.visible ? " show" : ""}`} role="alert">
          <div className="d-flex">
            <div className="toast-body fw-semibold fs-7">{toast.message}</div>
            <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Close" onClick={() => setToast((prev) => ({ ...prev, visible: false }))}></button>
          </div>
        </div>
      </div>
    </div>
  );
}
