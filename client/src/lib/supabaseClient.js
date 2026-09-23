import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const REMEMBER_KEY = "philfreela-remember-me";

// "Remember me" on the login form controls whether the session survives
// closing the browser (localStorage) or ends with the tab (sessionStorage) --
// important on shared/public devices. Supabase's storage adapter is fixed at
// client-creation time, so this reads the preference on every access instead
// of picking a fixed backing store up front.
const dynamicStorage = {
  getItem: (key) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== "false";
    return (remember ? localStorage : sessionStorage).getItem(key);
  },
  setItem: (key, value) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== "false";
    (remember ? localStorage : sessionStorage).setItem(key, value);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export function setRememberMe(remember) {
  localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

// Falls back to placeholder values so createClient() never throws when the
// real .env hasn't been filled in yet; callers should check isSupabaseConfigured.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  { auth: { storage: dynamicStorage } }
);

// A second connection used only by the admin "Add Admin" form. Calling
// signUp() on the main client would replace the signed-in admin's session
// with the new account; this one keeps its session in memory only (never
// saved), so creating an account here leaves the current admin logged in.
// detectSessionInUrl is off so it never grabs a login/reset link meant for
// the main client (e.g. on the Reset Password page).
export const supabaseSignup = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "philfreela-admin-signup"
    }
  }
);
