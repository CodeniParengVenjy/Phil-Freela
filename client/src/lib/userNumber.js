// A person's friendly ID, like PF-0007: "PF-" and the number from
// profiles.user_number (given by the database in order of sign-up, see
// database/supabase_user_number_schema.sql), with at least 4 digits.
export const formatUserNumber = (number) => `PF-${String(number).padStart(4, "0")}`;
