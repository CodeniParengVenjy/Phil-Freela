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
