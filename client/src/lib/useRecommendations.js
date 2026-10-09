import { useEffect, useMemo, useState } from "react";
import { getRecommendations } from "./aiService";

// The AI's picks ("Recommended for you": the Hybrid recommendation system, see
// aiService.js) for the dashboard lists: job posts for a freelancer, services
// for a client, best first. Nothing is asked unless `enabled`. If the AI
// service can't be reached there are simply no picks, so the list stays the
// plain newest-first one.
// Returns { loading, personalized, picked }: personalized is false when the AI
// only had "new and trusted" posts to offer (nothing to match yet); picked is a
// Map of post id -> { position (0 = best), reasons }.
export function useRecommendations(enabled) {
  const [state, setState] = useState({ loading: enabled, personalized: false, picks: [] });

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    getRecommendations()
      .then(({ personalized, results = [] }) => {
        if (active) setState({ loading: false, personalized, picks: results });
      })
      .catch(() => {
        if (active) setState({ loading: false, personalized: false, picks: [] });
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const picked = useMemo(
    () => new Map(state.picks.map((pick, position) => [pick.id, { position, reasons: pick.reasons || [] }])),
    [state.picks]
  );
  return { loading: state.loading, personalized: state.personalized, picked };
}

// A sort comparison: the AI's picks first, in its order. Everything else keeps
// the place it had (a sort keeps equal items where they were, so the rest stay
// newest first).
export function byPick(picked) {
  const rank = (item) => picked.get(item.id)?.position ?? Infinity;
  return (a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b));
}
