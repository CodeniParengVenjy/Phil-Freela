import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import "../admin.css";

const sidebarLinks = [
  { to: "/admin", end: true, icon: "bi-speedometer2", label: "Overview" },
  { to: "/admin/users", icon: "bi-people-fill", label: "Users" },
  { to: "/admin/listings", icon: "bi-grid-fill", label: "Listings" },
  { to: "/admin/reports", icon: "bi-flag-fill", label: "Reports", showPendingReports: true },
  { to: "/admin/verifications", icon: "bi-person-vcard-fill", label: "Verifications", showPendingVerifications: true },
  { to: "/admin/announcements", icon: "bi-megaphone-fill", label: "Announcements" },
  { to: "/admin/admins", icon: "bi-shield-lock-fill", label: "Admins" },
  // The same Browse Services / Find Jobs pages users see, shown in admin mode.
  { to: "/admin/browse-services", icon: "bi-shop", label: "Browse Services" },
  { to: "/admin/browse-jobs", icon: "bi-briefcase-fill", label: "Browse Jobs" }
];

// The shell every admin page shares: top bar, sidebar, and the admin-only
// guard. The pages themselves render inside <Outlet />.
export default function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // null while checking; the page stays blank until we know this is an admin,
  // so admin screens never flash for someone who isn't one.
  const [admin, setAdmin] = useState(null);
  // Number shown on the Reports link.
  const [pendingReports, setPendingReports] = useState(0);
  // Number shown on the Verifications link.
  const [pendingVerifications, setPendingVerifications] = useState(0);

  // Counts pending reports (head: true = just the count, no rows). The Reports
  // page calls this after resolving/dismissing so the badge stays correct.
  const refreshPendingReports = useCallback(async () => {
    const { count } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingReports(count || 0);
  }, []);

  // Counts identity verifications waiting for an admin. The Verifications
  // page calls this after approving/rejecting so the badge stays correct.
  const refreshPendingVerifications = useCallback(async () => {
    const { count } = await supabase
      .from("identity_verifications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingVerifications(count || 0);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login", { replace: true });
        return;
      }

      // Being logged in isn't enough: the account must also be in the
      // admins table. The database rules enforce this too; this check just
      // sends non-admins to the right page.
      const { data: adminRow } = await supabase
        .from("admins")
        .select("id, full_name, username")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (!adminRow) {
        navigate("/admin/login", { replace: true });
        return;
      }

      setAdmin(adminRow);
      refreshPendingReports();
      refreshPendingVerifications();
    })();

    return () => { active = false; };
  }, [navigate, refreshPendingReports, refreshPendingVerifications]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  if (!admin) {
    return <div className="admin-shell min-vh-100" />;
  }

  const adminName = admin.full_name || admin.username || "Admin";

  return (
    <div className="admin-shell text-light min-vh-100">
      <nav className="admin-topbar px-3 px-md-4">
        {/* Logo goes back to the admin Overview, or reloads it if already there. */}
        <Link
          to="/admin"
          onClick={(event) => {
            if (pathname === "/admin") {
              event.preventDefault();
              window.location.reload();
            }
          }}
          className="d-flex align-items-center gap-2 text-light text-decoration-none">
          <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 28 }} />
          <span className="fw-bold">Admin Panel</span>
        </Link>
        <div className="d-flex align-items-center gap-3">
          <span className="text-white-50 fs-7 d-none d-sm-inline">
            <i className="bi bi-person-circle me-1"></i> {adminName}
          </span>
          <button className="btn btn-outline-light btn-sm rounded-pill" onClick={handleSignOut}>
            <i className="bi bi-box-arrow-right me-1"></i> Sign Out
          </button>
        </div>
      </nav>

      <div className="container-fluid py-4 px-3 px-md-4">
        <div className="row g-4">
          <div className="col-12 col-md-3 col-xl-2">
            <aside className="admin-sidebar p-2 rounded-4">
              {sidebarLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `admin-nav-btn${isActive ? " active" : ""}`}
                >
                  <i className={`bi ${link.icon}`}></i>
                  <span>{link.label}</span>
                  {link.showPendingReports && pendingReports > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{pendingReports}</span>
                  )}
                  {link.showPendingVerifications && pendingVerifications > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{pendingVerifications}</span>
                  )}
                </NavLink>
              ))}
            </aside>
          </div>

          <main className="col-12 col-md-9 col-xl-10">
            {/* isAdmin tells the shared user pages (Browse Services / Jobs)
                to show admin buttons instead of user ones. */}
            <Outlet context={{ adminId: admin.id, adminName, isAdmin: true, refreshPendingReports, refreshPendingVerifications }} />
          </main>
        </div>
      </div>
    </div>
  );
}
