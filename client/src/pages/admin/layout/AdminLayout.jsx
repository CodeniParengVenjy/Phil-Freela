import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import AdminCreatePassword from "../components/AdminCreatePassword";
import "../admin.css";

const ADMIN_COLUMNS = "id, full_name, username, role, must_change_password";

const sidebarLinks = [
  { to: "/admin", end: true, icon: "bi-speedometer2", label: "Overview" },
  { to: "/admin/users", icon: "bi-people-fill", label: "Users" },
  { to: "/admin/listings", icon: "bi-grid-fill", label: "Listings" },
  { to: "/admin/reports", icon: "bi-flag-fill", label: "Reports", showPendingReports: true },
  { to: "/admin/verifications", icon: "bi-person-vcard-fill", label: "Verifications", showPendingVerifications: true },
  { to: "/admin/appeals", icon: "bi-envelope-paper-fill", label: "Appeals", showPendingAppeals: true },
  { to: "/admin/flagged", icon: "bi-images", label: "Flagged Content", showPendingFlagged: true },
  // superAdminOnly: hidden from regular admins, and their address bar is
  // sent back to Overview. The database rules are the real protection.
  { to: "/admin/announcements", icon: "bi-megaphone-fill", label: "Announcements", superAdminOnly: true },
  { to: "/admin/billboard", icon: "bi-easel2-fill", label: "Billboard", superAdminOnly: true },
  { to: "/admin/admins", icon: "bi-shield-lock-fill", label: "Admins", superAdminOnly: true },
  { to: "/admin/log", icon: "bi-journal-text", label: "Activity Log" },
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
  // Number shown on the Appeals link.
  const [pendingAppeals, setPendingAppeals] = useState(0);
  // Number shown on the Flagged Content link.
  const [pendingFlagged, setPendingFlagged] = useState(0);

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

  // Counts appeals waiting for an admin. The Appeals page calls this after
  // accepting/rejecting so the badge stays correct.
  const refreshPendingAppeals = useCallback(async () => {
    const { count } = await supabase
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingAppeals(count || 0);
  }, []);

  // Counts photos and documents the copy check held back (watermarking steps
  // 5-6). The Flagged Content page calls this after each review so the badge
  // stays correct.
  const refreshPendingFlagged = useCallback(async () => {
    const [photos, documents] = await Promise.all([
      supabase.from("media_slides").select("id", { count: "exact", head: true }).eq("status", "flagged"),
      supabase.from("portfolio_items").select("id", { count: "exact", head: true }).eq("kind", "document").eq("status", "flagged")
    ]);
    setPendingFlagged((photos.count || 0) + (documents.count || 0));
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
        .select(ADMIN_COLUMNS)
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (!adminRow) {
        navigate("/admin/login", { replace: true });
        return;
      }

      setAdmin(adminRow);
      // Nothing to count yet for an admin who still has to choose a password.
      if (!adminRow.must_change_password) {
        refreshPendingReports();
        refreshPendingVerifications();
        refreshPendingAppeals();
        refreshPendingFlagged();
      }
    })();

    return () => { active = false; };
  }, [navigate, refreshPendingReports, refreshPendingVerifications, refreshPendingAppeals, refreshPendingFlagged]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // Called by the "Create your password" screen after it saves. The database
  // switches the flag off by itself when the password really changes, so this
  // only re-reads the row. True means the panel can open.
  const recheckPassword = async () => {
    const { data } = await supabase
      .from("admins")
      .select(ADMIN_COLUMNS)
      .eq("id", admin.id)
      .maybeSingle();
    if (!data || data.must_change_password) return false;

    setAdmin(data);
    refreshPendingReports();
    refreshPendingVerifications();
    refreshPendingAppeals();
    refreshPendingFlagged();
    return true;
  };

  if (!admin) {
    return <div className="admin-shell min-vh-100" />;
  }

  const adminName = admin.full_name || admin.username || "Admin";
  // Only for showing or hiding buttons; the database enforces the real rule.
  const isSuperAdmin = admin.role === "super_admin";

  // A new admin on the default password sees only this screen. The database
  // also gives them no admin rights until they choose their own.
  if (admin.must_change_password) {
    return <AdminCreatePassword adminName={adminName} onDone={recheckPassword} onSignOut={handleSignOut} />;
  }

  // A regular admin who types a super-admin-only address goes back to Overview.
  const visibleLinks = sidebarLinks.filter((link) => isSuperAdmin || !link.superAdminOnly);
  const onSuperAdminPage = sidebarLinks.some((link) => link.superAdminOnly && (pathname === link.to || pathname.startsWith(`${link.to}/`)));
  if (!isSuperAdmin && onSuperAdminPage) {
    return <Navigate to="/admin" replace />;
  }

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
            {isSuperAdmin && <span className="badge admin-badge-orange ms-2 fw-normal">Super admin</span>}
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
              {visibleLinks.map((link) => (
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
                  {link.showPendingAppeals && pendingAppeals > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{pendingAppeals}</span>
                  )}
                  {link.showPendingFlagged && pendingFlagged > 0 && (
                    <span className="badge bg-danger rounded-pill ms-auto">{pendingFlagged}</span>
                  )}
                </NavLink>
              ))}
            </aside>
          </div>

          <main className="col-12 col-md-9 col-xl-10">
            {/* isAdmin tells the shared user pages (Browse Services / Jobs)
                to show admin buttons instead of user ones. */}
            <Outlet context={{ adminId: admin.id, adminName, isAdmin: true, isSuperAdmin, refreshPendingReports, refreshPendingVerifications, refreshPendingAppeals, refreshPendingFlagged }} />
          </main>
        </div>
      </div>
    </div>
  );
}
