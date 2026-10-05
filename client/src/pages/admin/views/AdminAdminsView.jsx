import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase, supabaseSignup } from "../../../lib/supabaseClient";
import { EMAIL_PATTERN } from "../../../lib/validators";
import { getFriendlyErrorMessage } from "../../../lib/errors";
import { DEFAULT_ADMIN_PASSWORD } from "../../../lib/adminPassword";

const emptyForm = { fullName: "", username: "", email: "" };

export default function AdminAdminsView() {
  const { adminId, isSuperAdmin } = useOutletContext();
  const [admins, setAdmins] = useState(null);
  const [listError, setListError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);
  // Bumping this number re-runs the effect below, which reloads the list.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("admins")
        .select("id, full_name, username, role, must_change_password, created_at")
        .order("created_at", { ascending: true });

      if (!active) return;

      if (error) setListError("Failed to load admins.");
      else setAdmins(data);
    })();

    return () => { active = false; };
  }, [reloadKey]);

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleAddAdmin = async (event) => {
    event.preventDefault();

    const fullName = form.fullName.trim();
    const username = form.username.trim();
    const email = form.email.trim().toLowerCase();

    // Check the form in the browser first so obvious mistakes never reach the server.
    if (!fullName || !username || !email) {
      setMessage({ text: "Please fill in all fields.", type: "error" });
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setMessage({ text: "Please enter a valid email address.", type: "error" });
      return;
    }

    setSubmitting(true);
    setMessage({ text: "Creating admin account...", type: "" });

    try {
      // Check the username before creating the login, so a taken username
      // can't leave behind a login account with no admin row.
      const { data: taken } = await supabase.from("admins").select("id").eq("username", username).maybeSingle();
      if (taken) throw new Error("That username is already used by another admin.");

      // 1) Create the login account on the separate connection, so the
      //    admin using this page stays signed in as themselves. Every new
      //    admin starts with the default password; the super admin never
      //    chooses or sees the one they end up with.
      const { data, error } = await supabaseSignup.auth.signUp({
        email,
        password: DEFAULT_ADMIN_PASSWORD,
        options: {
          // The new admin's confirmation link opens the Admin Sign In page.
          emailRedirectTo: `${window.location.origin}/admin/login`,
          data: { full_name: fullName, username }
        }
      });
      // With "Confirm email" on, an email that's already used comes back as
      // a user with no identities instead of an error.
      if (error?.message.toLowerCase().includes("already registered") || data.user?.identities?.length === 0) {
        throw new Error("That email already has an account. Use a different email for the new admin.");
      }
      if (error) throw error;
      // No session means Supabase is waiting for them to confirm their email.
      const needsConfirm = !data.session;

      // 2) Mark the new account as an admin. The "super admins can add
      //    admins" database rule only lets a super admin do this, only as a
      //    plain admin (a super admin is made by promoting), and only with
      //    must_change_password on. While that is on they have no admin
      //    rights; the database switches it off when they choose a password.
      const { error: adminError } = await supabase.from("admins").insert({
        id: data.user.id,
        full_name: fullName,
        username,
        role: "admin",
        must_change_password: true
      });
      if (adminError) throw new Error("The account was created, but it could not be made an admin: " + adminError.message);

      // Forget the new account's session; we only needed it to create the login.
      await supabaseSignup.auth.signOut({ scope: "local" });

      setMessage({
        text: needsConfirm
          ? `${fullName} is now an admin. They must click the confirmation link sent to ${email}, then sign in with the default password (${DEFAULT_ADMIN_PASSWORD}) and create their own.`
          : `${fullName} is now an admin. They sign in with the default password (${DEFAULT_ADMIN_PASSWORD}) and will be asked to create their own.`,
        type: "success"
      });
      setForm(emptyForm);
      setShowForm(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setMessage({ text: getFriendlyErrorMessage(error), type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const removeAdmin = async (admin) => {
    if (!window.confirm(`Remove ${admin.full_name} as an admin? Their login account will be deleted.`)) return;

    // remove_admin() is a database function that re-checks everything on the
    // server: the caller must be a super admin and can't remove themselves.
    const { error } = await supabase.rpc("remove_admin", { target_id: admin.id });
    if (error) {
      setMessage({ text: error.message || "Failed to remove admin.", type: "error" });
      return;
    }

    setMessage({ text: `${admin.full_name} was removed.`, type: "success" });
    setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
  };

  // Promote an admin to super admin, or demote one back. set_admin_role() is
  // the only way to change a role; it re-checks that the caller is a super
  // admin and isn't changing their own role.
  const changeRole = async (admin, newRole) => {
    const promoting = newRole === "super_admin";
    const question = promoting
      ? `Promote ${admin.full_name} to super admin? They will be able to add and remove admins and delete users.`
      : `Demote ${admin.full_name} to a regular admin? They will lose those powers.`;
    if (!window.confirm(question)) return;

    const { error } = await supabase.rpc("set_admin_role", { target_id: admin.id, new_role: newRole });
    if (error) {
      setMessage({ text: error.message || "Failed to change the role.", type: "error" });
      return;
    }

    setMessage({ text: `${admin.full_name} is now ${promoting ? "a super admin" : "a regular admin"}.`, type: "success" });
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, role: newRole } : a)));
  };

  return (
    <section>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0">Admins</h1>
        {isSuperAdmin && (
          <button
            className="btn btn-admin-orange btn-sm rounded-pill px-3 fw-bold"
            onClick={() => { setShowForm((prev) => !prev); setMessage({ text: "", type: "" }); }}
          >
            <i className={`bi ${showForm ? "bi-x-lg" : "bi-plus-lg"} me-1`}></i> {showForm ? "Cancel" : "Add Admin"}
          </button>
        )}
      </div>

      {!isSuperAdmin && (
        <p className="text-white-50 fs-7">Only a super admin can add, remove or change the role of admins.</p>
      )}

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {isSuperAdmin && showForm && (
        <form className="admin-card rounded-4 p-3 p-md-4 mb-4" noValidate onSubmit={handleAddAdmin}>
          <h2 className="h6 fw-bold text-white mb-3">New Admin Account</h2>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label htmlFor="newAdminName" className="form-label text-white-50 fs-7 mb-1">Full Name</label>
              <input id="newAdminName" type="text" className="form-control admin-input" value={form.fullName} onChange={updateField("fullName")} required />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="newAdminUsername" className="form-label text-white-50 fs-7 mb-1">Username</label>
              <input id="newAdminUsername" type="text" className="form-control admin-input" value={form.username} onChange={updateField("username")} required />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="newAdminEmail" className="form-label text-white-50 fs-7 mb-1">Email Address</label>
              <input id="newAdminEmail" type="email" className="form-control admin-input" value={form.email} onChange={updateField("email")} required />
            </div>
            <div className="col-12">
              <p className="text-white-50 fs-7 mb-0">
                <i className="bi bi-key me-1"></i> You don't set their password. They sign in with the default
                password <strong className="text-white">{DEFAULT_ADMIN_PASSWORD}</strong> and must create their own
                before the Admin Panel opens.
              </p>
            </div>
          </div>
          <button type="submit" className="btn btn-admin-orange rounded-pill px-4 fw-bold mt-3" disabled={submitting}>
            Create Admin
          </button>
        </form>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Admin Since</th>
                {isSuperAdmin && <th className="text-end">Action</th>}
              </tr>
            </thead>
            <tbody>
              {listError && (
                <tr><td colSpan={5} className="text-center text-white-50 py-4">{listError}</td></tr>
              )}
              {!listError && admins === null && (
                <tr><td colSpan={5} className="text-center text-white-50 py-4">Loading admins...</td></tr>
              )}
              {!listError && admins?.map((admin) => (
                <tr key={admin.id}>
                  <td>
                    {admin.full_name}
                    {admin.id === adminId && <span className="badge admin-badge-orange ms-2 fw-normal">You</span>}
                  </td>
                  <td>{admin.username}</td>
                  <td>
                    <span className={`badge ${admin.role === "super_admin" ? "admin-badge-orange" : "bg-secondary"} fw-normal`}>
                      {admin.role === "super_admin" ? "Super admin" : "Admin"}
                    </span>
                    {/* Still on the default password: no admin rights yet. */}
                    {admin.must_change_password && <span className="badge text-bg-warning ms-2 fw-normal">Password not set yet</span>}
                  </td>
                  <td>{new Date(admin.created_at).toLocaleDateString()}</td>
                  {isSuperAdmin && (
                    <td className="text-end">
                      {/* No buttons on your own row; the database blocks those too. */}
                      {admin.id !== adminId && (
                        <div className="d-inline-flex flex-wrap justify-content-end gap-2">
                          {admin.role === "super_admin" ? (
                            <button className="btn btn-outline-light btn-sm" onClick={() => changeRole(admin, "admin")}>
                              <i className="bi bi-arrow-down-circle"></i> Demote
                            </button>
                          ) : (
                            <button className="btn btn-outline-warning btn-sm" onClick={() => changeRole(admin, "super_admin")}>
                              <i className="bi bi-arrow-up-circle"></i> Promote
                            </button>
                          )}
                          <button className="btn btn-outline-danger btn-sm" onClick={() => removeAdmin(admin)}>
                            <i className="bi bi-trash"></i> Remove
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
