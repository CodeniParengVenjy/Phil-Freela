import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { GrowthChart, GrowthTable } from "./GrowthChart";

// How many days the graph can cover.
const RANGES = [7, 30, 90];

// The graph at the top of the Overview's Transactions, Job hiring and Earnings parts
// (PLAN-overview-sections.md, Step 2). It asks the database for admin_activity_trends()
// when it opens, and again when another number of days is picked, and draws it with
// GrowthChart: the same look, hover, arrow keys and "View as table" as the Growth graph.
// The database sends how many NEW things there were on each day and the totals right
// now; GrowthChart works out the running totals from them.
//
// Props:
//   tabs  the graphs to pick from; with only one, no tab buttons are drawn. Each is
//         { key, label, title, totalLabel, emptyText, headline, series, format, tickFormat }:
//         what GrowthChart takes, where the series keys are names in admin_activity_trends()
//         and `label` is the name on the tab button.
export default function ActivityGraph({ tabs }) {
  const [days, setDays] = useState(30);
  const [tabKey, setTabKey] = useState(tabs[0].key);
  // { days: [one row per day], totals: {...} } from admin_activity_trends().
  const [activity, setActivity] = useState(null);
  // "" (fine), "not-set-up" (the database function isn't there yet) or "failed".
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error: loadError } = await supabase.rpc("admin_activity_trends", { p_days: days });
      if (!active) return;

      if (loadError) {
        // PGRST202 means the function was never added to the database.
        setError(loadError.code === "PGRST202" ? "not-set-up" : "failed");
      } else {
        setActivity(data);
        setError("");
      }
      setLoading(false);
    })();

    return () => { active = false; };
  }, [days]);

  function pickDays(count) {
    if (count === days) return;
    // The old graph stays on screen, dimmed, until the new numbers arrive.
    setLoading(true);
    setDays(count);
  }

  const tab = tabs.find((item) => item.key === tabKey) || tabs[0];

  return (
    <div className="mb-3">
      {/* What to count (when there is more than one graph), and for how long. */}
      <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
        {tabs.length > 1 && (
          <div className="admin-seg" role="group" aria-label="What to count">
            {tabs.map((item) => (
              <button key={item.key} type="button" className={tab.key === item.key ? "active" : ""} aria-pressed={tab.key === item.key} onClick={() => setTabKey(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="admin-seg ms-auto" role="group" aria-label="How many days to show">
          {RANGES.map((count) => (
            <button key={count} type="button" className={days === count ? "active" : ""} aria-pressed={days === count} onClick={() => pickDays(count)}>
              {count} days
            </button>
          ))}
        </div>
      </div>

      {error === "not-set-up" && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          The graph isn't set up yet (run supabase_admin_activity_schema.sql in the Supabase SQL Editor). The numbers below still work.
        </div>
      )}
      {error === "failed" && <div className="admin-card rounded-4 p-4 text-center text-white-50">Failed to load the graph.</div>}
      {!error && !activity && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the graph...</div>}

      {!error && activity && (
        <div className={loading ? "admin-trends-loading" : ""} aria-busy={loading}>
          {showTable ? (
            <GrowthTable series={tab.series} data={activity.days} current={activity.totals} headline={tab.headline} format={tab.format} />
          ) : (
            <GrowthChart
              title={tab.title}
              totalLabel={tab.totalLabel}
              emptyText={tab.emptyText}
              series={tab.series}
              data={activity.days}
              current={activity.totals}
              days={activity.days.length}
              headline={tab.headline}
              format={tab.format}
              tickFormat={tab.tickFormat}
            />
          )}
          <div className="text-end mt-2">
            <button type="button" className="btn btn-link btn-sm text-secondary p-0" onClick={() => setShowTable(!showTable)}>
              {showTable ? "Back to the graph" : "View as table"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
