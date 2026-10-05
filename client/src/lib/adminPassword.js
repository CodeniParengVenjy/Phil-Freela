// Every admin a super admin adds starts with this password. The first time
// they sign in, the Admin Panel makes them choose their own before anything
// else opens (pages/admin/components/AdminCreatePassword.jsx), and the
// database gives them no admin rights until they do. The same value is
// written in database/supabase_admin_log_schema.sql, which refuses to count
// it as "their own" password.
export const DEFAULT_ADMIN_PASSWORD = "Admin123";
