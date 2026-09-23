import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// Moved as-is from the old single-page admin dashboard. Build step 2 adds
// search, filters, suspend, and a real account delete.
export default function AdminUsersView() {
  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, username, account_type, created_at")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (profilesError) setUsersError("Failed to load users.");
      else setUsers(profileRows);
    })();

    return () => { active = false; };
  }, []);

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
    <section>
      <h1 className="h4 fw-bold mb-3">Users</h1>
      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Joined</th>
                <th className="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              {usersError && (
                <tr><td colSpan={5} className="text-center text-white-50 py-4">{usersError}</td></tr>
              )}
              {!usersError && users === null && (
                <tr><td colSpan={5} className="text-center text-white-50 py-4">Loading users...</td></tr>
              )}
              {!usersError && users !== null && users.length === 0 && (
                <tr><td colSpan={5} className="text-center text-white-50 py-4">No users found.</td></tr>
              )}
              {!usersError && users?.map((user) => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td>{user.username}</td>
                  <td>
                    <span className={`badge ${user.account_type === "client" ? "bg-info" : "admin-badge-orange"} text-white fw-normal`}>
                      {user.account_type === "client" ? "Client" : "Freelancer"}
                    </span>
                  </td>
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
  );
}
