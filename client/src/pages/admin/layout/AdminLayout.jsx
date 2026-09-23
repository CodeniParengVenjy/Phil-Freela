import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import "../admin.css";

// Each later build step adds its page here (Listings, Verifications, Reports).
const sidebarLinks = [
  { to: "/admin", end: true, icon: "bi-speedometer2", label: "Overview" },
  { to: "/admin/users", icon: "bi-people-fill", label: "Users" },
  { to: "/admin/admins", icon: "bi-shield-lock-fill", label: "Admins" }
];

// The shell every admin page shares: top bar, sidebar, and the admin-only
// guard. The pages themselves render inside <Outlet />.
export default function AdminLayout() {
  const navigate = useNavigate();
  // null while checking; the page stays blank until we know this is an admin,
  // so admin screens never flash for someone who isn't one.
  const [admin, setAdmin] = useState(null);

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
    })();

    return () => { active = false; };
  }, [navigate]);

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
        <span className="d-flex align-items-center gap-2">
          <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 28 }} />
          <span className="fw-bold">Admin Panel</span>
        </span>
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
                </NavLink>
              ))}
            </aside>
          </div>

          <main className="col-12 col-md-9 col-xl-10">
            <Outlet context={{ adminId: admin.id, adminName }} />
          </main>
        </div>
      </div>
    </div>
  );
}
