import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Online / offline status (database/supabase_presence_schema.sql). While a
// dashboard page is open and on screen, the app tells the database "I'm
// here" once a minute. Anyone seen in the last 2 minutes counts as online.
const HEARTBEAT_MS = 60 * 1000;
const REFRESH_MS = 30 * 1000;
const ONLINE_SECONDS = 2 * 60;

// Starts the once-a-minute "I'm here". Returns a function that stops it.
export function startPresenceHeartbeat() {
  const beat = () => {
    // A hidden tab (another tab or app in front) doesn't count, so a
    // forgotten tab doesn't keep someone "online" all day.
    if (document.visibilityState !== "visible") return;
    // .then() is what actually sends it; errors are ignored (the status just
    // goes stale until the next beat).
    supabase.rpc("touch_last_seen").then(() => {});
  };

  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", beat);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", beat);
  };
}

// { online, label } for someone last seen secondsAgo seconds ago, or null
// when they've never been seen: "Online", "Offline 5m ago", "Offline 3h ago",
// "Offline 2d ago".
export function presenceStatus(secondsAgo) {
  if (secondsAgo === undefined) return null;
  if (secondsAgo <= ONLINE_SECONDS) return { online: true, label: "Online" };
  const minutes = Math.floor(secondsAgo / 60);
  if (minutes < 60) return { online: false, label: `Offline ${minutes}m ago` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, label: `Offline ${hours}h ago` };
  return { online: false, label: `Offline ${Math.floor(hours / 24)}d ago` };
}

// How long ago each of userIds was last seen, as a Map of id -> seconds.
// Asked again every 30 seconds so "Online" / "Offline" stays current.
export function usePresence(userIds) {
  const key = [...new Set(userIds.filter(Boolean))].sort().join(",");
  const [secondsAgo, setSecondsAgo] = useState(() => new Map());

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("last_seen_seconds", { ids: key.split(",") });
      // Fails until supabase_presence_schema.sql is run; the status is then just left out.
      if (active && !error) setSecondsAgo(new Map(data.map((row) => [row.user_id, row.seconds_ago])));
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key]);

  return secondsAgo;
}
