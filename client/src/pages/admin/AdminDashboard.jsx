import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./admin.css";

const navItems = [
  { key: "users", label: "Manage Users", icon: "bi-people" },
  { key: "projects", label: "Manage Projects", icon: "bi-kanban" },
  { key: "feedback", label: "Review Feedback", icon: "bi-chat-square-text" }
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState("Admin");
  const [activeView, setActiveView] = useState("users");
  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login", { replace: true });
        return;
      }

      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("full_name, username")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (adminError || !adminRow) {
        navigate("/admin/login", { replace: true });
        return;
      }

      setAdminName(adminRow.full_name || adminRow.username || "Admin");

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, username, created_at")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (profilesError) {
        setUsersError("Failed to load users.");
      } else {
        setUsers(profileRows);
      }
    })();

    return () => { active = false; };
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  const removeUser = async (id) => {
    if (!window.confirm("Remove this user account? This cannot be undone.")) return;

    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      window.alert(error.message || "Failed to remove user.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  return (
    <div className="bg-dark text-light">
      <nav className="navbar navbar-dark admin-topbar px-3 px-md-4">
        <span className="navbar-brand d-flex align-items-center gap-2 m-0">
          <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 28 }} />
          <span className="fw-bold">Admin Panel</span>
        </span>
        <div className="d-flex align-items-center gap-3">
          <span className="text-white-50 fs-7 d-none d-sm-inline">{adminName}</span>
          <button className="btn btn-outline-light btn-sm rounded-pill" onClick={handleSignOut}>
            <i className="bi bi-box-arrow-right me-1"></i> Sign Out
          </button>
        </div>
      </nav>

      <div className="container-fluid py-4 px-3 px-md-4">
        <div className="row g-4">
          <div className="col-12 col-md-3 col-lg-2">
            <div className="admin-sidebar p-2 rounded-4">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  className={`admin-nav-btn${activeView === item.key ? " active" : ""}`}
                  onClick={() => setActiveView(item.key)}
                >
                  <i className={`bi ${item.icon} me-2`}></i> {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="col-12 col-md-9 col-lg-10">
            {activeView === "users" && (
              <section className="admin-view active-view">
                <h1 className="h4 fw-bold mb-3">Manage Users</h1>
                <div className="admin-card rounded-4 p-3 p-md-4">
                  <div className="table-responsive">
                    <table className="table table-dark table-hover align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Full Name</th>
                          <th>Username</th>
                          <th>Joined</th>
                          <th className="text-end">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersError && (
                          <tr><td colSpan={4} className="text-center text-white-50 py-4">{usersError}</td></tr>
                        )}
                        {!usersError && users === null && (
                          <tr><td colSpan={4} className="text-center text-white-50 py-4">Loading users...</td></tr>
                        )}
                        {!usersError && users !== null && users.length === 0 && (
                          <tr><td colSpan={4} className="text-center text-white-50 py-4">No users found.</td></tr>
                        )}
                        {!usersError && users?.map((user) => (
                          <tr key={user.id}>
                            <td>{user.full_name}</td>
                            <td>{user.username}</td>
                            <td>{new Date(user.created_at).toLocaleDateString()}</td>
                            <td className="text-end">
                              <button className="btn btn-outline-danger btn-sm" onClick={() => removeUser(user.id)}>
                                <i className="bi bi-trash"></i> Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {activeView === "projects" && (
              <section className="admin-view active-view">
                <h1 className="h4 fw-bold mb-3">Manage Projects</h1>
                <div className="admin-card rounded-4 p-4 text-center text-white-50">
                  <i className="bi bi-kanban fs-1 d-block mb-2"></i>
                  No project data source connected yet. This section will populate once the projects feature is backed by the database.
                </div>
              </section>
            )}

            {activeView === "feedback" && (
              <section className="admin-view active-view">
                <h1 className="h4 fw-bold mb-3">Review Feedback</h1>
                <div className="admin-card rounded-4 p-4 text-center text-white-50">
                  <i className="bi bi-chat-square-text fs-1 d-block mb-2"></i>
                  No feedback data source connected yet. This section will populate once the feedback feature is backed by the database.
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
