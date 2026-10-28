import { useEffect, useMemo, useRef, useState } from "react";

// The graphs on the Overview: how many users (or listings, bookings, applications,
// pesos earned...) there are, day by day, as one line per kind. GrowthChart draws it
// (by hand as SVG, no chart library) and GrowthTable lists the same numbers as a table.
//
// The database only sends how many NEW things there were on each day (admin_trends,
// admin_activity_trends) and the totals right now (admin_stats, admin_activity_trends).
// The total at the end of any earlier day is today's total minus everything added after
// that day, so no history has to be stored. It counts what exists now: an account that
// was deleted does not appear in the past.
//
// Props (both components):
//   series    what to draw: [{ key: "freelancers", label: "Freelancers", color: "var(--trend-orange)" }]
//   data      the rows of new things per day: { day: "2026-10-24", freelancers: 2, ... }, oldest first
//   current   the totals right now: { freelancers: 18, clients: 12, ... }
//   headline  optional: the key of the one series the big number and "added that day" count.
//             Without it they add up all the series, which is right when the series are parts
//             of one whole (freelancers + clients). Series that are nested (accepted bookings
//             are part of the bookings made) need a headline, or they would be counted twice.
//   format    optional: how a number is written in the big number, the legend, the tooltip
//             and the table (pesos: "₱1,250.00"). Default: the plain number.
// GrowthChart also takes title, totalLabel (what the big number counts), emptyText (shown
// when there is nothing yet), days, and tickFormat (the numbers up the side and at the
// line ends; shorter than format for money; default: format).

const HEIGHT = 230;
const MARGIN = { top: 14, right: 30, bottom: 26, left: 30 };
const LABEL_SPACE = 64; // room for one date label on the bottom axis
const TOO_CLOSE = 14; // two end numbers closer than this (pixels) would overlap
const CHAR_WIDTH = 7; // about how wide one character of an axis or end number is (pixels)

const plain = (value) => String(value);

// "2026-10-24" -> a Date at local midnight. new Date("2026-10-24") would be read
// as UTC and could show the day before, so the parts are used one by one.
function parseDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}
const shortDay = (day) => parseDay(day).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const longDay = (day) => parseDay(day).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

// One row per day with the total of each series at the END of that day, and how
// many were added that day. Counting back from today: the total now, minus what
// came in today = the total at the end of yesterday, and so on.
function runningTotals(data, series, current, headline) {
  const rows = data.map((row) => ({ day: row.day, added: 0 }));
  series.forEach((s) => {
    let running = current[s.key] || 0;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      rows[i][s.key] = Math.max(running, 0);
      if (!headline || s.key === headline) rows[i].added += data[i][s.key] || 0;
      running -= data[i][s.key] || 0;
    }
  });
  return rows;
}

// Whole-number tick marks up the side (a count of people is never 1.5): the
// smallest step that gives no more than 4 gaps, and a top that is a multiple of it.
function niceTicks(max) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  const target = Math.max(max, 2);
  const step = steps.find((s) => Math.ceil(target / s) <= 4) ?? 1000000;
  const top = Math.ceil(target / step) * step;
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

// The width of the box the chart sits in; it is redrawn when the window changes,
// so the text stays sharp and the same size on a phone and on a wide screen.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function GrowthChart({ title, totalLabel, emptyText, series, data, current, days, headline, format = plain, tickFormat = format }) {
  const [boxRef, width] = useWidth();
  // The day the pointer (or the arrow keys) is on, or null.
  const [active, setActive] = useState(null);

  const rows = useMemo(() => runningTotals(data, series, current, headline), [data, series, current, headline]);
  const countedSeries = headline ? series.filter((s) => s.key === headline) : series;
  const totalNow = countedSeries.reduce((sum, s) => sum + (current[s.key] || 0), 0);
  const gained = rows.reduce((sum, row) => sum + row.added, 0);

  const { top: topValue, ticks } = niceTicks(Math.max(0, ...rows.flatMap((row) => series.map((s) => row[s.key]))));
  const lastRow = rows[rows.length - 1];
  // Room on the left for the longest number up the side, and on the right for the
  // numbers at the line ends (money is wider than a count).
  const margin = {
    ...MARGIN,
    left: Math.max(MARGIN.left, 14 + CHAR_WIDTH * tickFormat(topValue).length),
    right: Math.max(MARGIN.right, lastRow ? 14 + CHAR_WIDTH * Math.max(...series.map((s) => tickFormat(lastRow[s.key]).length)) : 0)
  };
  const plotWidth = Math.max(width - margin.left - margin.right, 0);
  const plotHeight = HEIGHT - margin.top - margin.bottom;
  const baseY = margin.top + plotHeight;
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
  const xAt = (index) => margin.left + index * step;
  const yAt = (value) => baseY - (value / topValue) * plotHeight;

  // Which day is nearest to the pointer.
  function dayAt(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const index = step ? Math.round((event.clientX - box.left - margin.left) / step) : 0;
    return Math.min(Math.max(index, 0), rows.length - 1);
  }

  function onKeyDown(event) {
    if (!rows.length) return;
    const last = rows.length - 1;
    const moves = {
      ArrowLeft: (i) => (i === null ? last : Math.max(i - 1, 0)),
      ArrowRight: (i) => (i === null ? last : Math.min(i + 1, last)),
      Home: () => 0,
      End: () => last,
      Escape: () => null
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    setActive(moves[event.key](active));
  }

  // The date labels along the bottom: counted back from the last day so the
  // newest date is always there, spaced so they never touch.
  const every = Math.max(1, Math.ceil(LABEL_SPACE / (step || 1)));
  const labelDays = [];
  for (let i = rows.length - 1; i >= 0; i -= every) labelDays.push(i);

  // The number at the end of each line. If two lines end almost on top of each
  // other the numbers are left out (the legend above still has them).
  const endYs = lastRow ? series.map((s) => yAt(lastRow[s.key])).sort((a, b) => a - b) : [];
  const endCrowded = endYs.some((y, i) => i > 0 && y - endYs[i - 1] < TOO_CLOSE);

  const activeRow = active === null ? null : rows[active];
  const nothing = series.every((s) => !(current[s.key] || 0)) && gained === 0;
  // The tooltip sits beside the active day, on the side with more room, so it
  // never covers the dots on the line.
  const tipOnRight = active !== null && xAt(active) < width / 2;
  const tipStyle = active === null ? {} : tipOnRight ? { left: xAt(active) + 14 } : { right: width - xAt(active) + 14 };

  return (
    <div className="admin-card rounded-4 p-3 p-md-4">
      <div className="mb-2">
        <h3 className="h6 fw-bold text-white mb-1">{title}</h3>
        <div className="d-flex flex-wrap align-items-baseline column-gap-3">
          <span className="admin-trend-total">{format(totalNow)}</span>
          <span className="text-secondary fs-7">{totalLabel}</span>
          <span className="fs-7">
            {gained > 0 ? (
              <><strong className="text-success">+{format(gained)}</strong> <span className="text-secondary">in the last {days} days</span></>
            ) : (
              <span className="text-secondary">No change in the last {days} days</span>
            )}
          </span>
        </div>
      </div>

      <ul className="admin-trend-legend list-unstyled d-flex flex-wrap gap-3 mb-2">
        {series.map((s) => (
          <li key={s.key} className="d-flex align-items-center gap-2 fs-8 text-white-50">
            <span className="admin-trend-key" style={{ background: s.color }}></span>
            {s.label}
            <strong className="text-white">{format(current[s.key] || 0)}</strong>
          </li>
        ))}
      </ul>

      <div
        className="admin-trend-box"
        ref={boxRef}
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="group"
        aria-label={`${title} over the last ${days} days. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {nothing ? (
          <div className="admin-trend-empty text-secondary fs-7">{emptyText}</div>
        ) : (
          width > 0 && lastRow && (
            <svg
              width={width}
              height={HEIGHT}
              aria-hidden="true"
              onPointerMove={(event) => setActive(dayAt(event))}
              onPointerDown={(event) => setActive(dayAt(event))}
              onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
            >
              {/* Side numbers and the thin lines behind the graph. */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    className={tick === 0 ? "admin-trend-base" : "admin-trend-grid"}
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={yAt(tick)}
                    y2={yAt(tick)}
                  />
                  <text className="admin-trend-axis" x={margin.left - 8} y={yAt(tick) + 4} textAnchor="end">{tickFormat(tick)}</text>
                </g>
              ))}

              {/* The day under the pointer: a thin vertical line. */}
              {active !== null && <line className="admin-trend-cross" x1={xAt(active)} x2={xAt(active)} y1={margin.top} y2={baseY} />}

              {series.map((s) => (
                <path
                  key={s.key}
                  className="admin-trend-line"
                  style={{ stroke: s.color }}
                  d={rows.map((row, index) => `${index === 0 ? "M" : "L"}${xAt(index)},${yAt(row[s.key])}`).join("")}
                />
              ))}

              {/* A dot on every line at the active day, or at the end when nothing is hovered. */}
              {series.map((s) => {
                const index = active === null ? rows.length - 1 : active;
                return (
                  <g key={s.key}>
                    <circle className="admin-trend-ring" style={{ fill: s.color }} cx={xAt(index)} cy={yAt(rows[index][s.key])} r={4} />
                    {active === null && !endCrowded && (
                      <text className="admin-trend-end" x={xAt(index) + 9} y={yAt(rows[index][s.key]) + 4}>{tickFormat(rows[index][s.key])}</text>
                    )}
                  </g>
                );
              })}

              {labelDays.map((index) => (
                <text key={rows[index].day} className="admin-trend-axis" x={xAt(index)} y={HEIGHT - 6} textAnchor="middle">
                  {shortDay(rows[index].day)}
                </text>
              ))}
            </svg>
          )
        )}

        {activeRow && !nothing && (
          <div className="admin-trend-tip" style={tipStyle}>
            <div className="text-white-50 fs-8 mb-1">{longDay(activeRow.day)}</div>
            {series.map((s) => {
              const added = data[active][s.key] || 0;
              return (
                <div key={s.key} className="d-flex align-items-center gap-2">
                  <span className="admin-trend-key" style={{ background: s.color }}></span>
                  <strong className="text-white">{format(activeRow[s.key])}</strong>
                  <span className="text-white-50 fs-8">{s.label}</span>
                  {added > 0 && <span className="text-success fs-8">+{format(added)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Read out by screen readers while the arrow keys or pointer move. */}
      <span className="visually-hidden" aria-live="polite">
        {activeRow ? `${longDay(activeRow.day)}: ${series.map((s) => `${format(activeRow[s.key])} ${s.label}`).join(", ")}` : ""}
      </span>
    </div>
  );
}

// The same numbers as a table, newest day first. Shown instead of the graph when
// "View as table" is picked. Every number the graph shows can be read here.
export function GrowthTable({ series, data, current, headline, format = plain }) {
  const rows = useMemo(() => runningTotals(data, series, current, headline), [data, series, current, headline]);
  const newestFirst = [...rows].reverse();
  return (
    <div className="admin-card rounded-4 p-3">
      <div className="table-responsive admin-trend-table">
        <table className="table table-dark align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Day</th>
              {series.map((s) => <th scope="col" key={s.key} className="text-end">{s.label}</th>)}
              <th scope="col" className="text-end">Added that day</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row) => (
              <tr key={row.day}>
                <th scope="row" className="fw-normal text-nowrap">{longDay(row.day)}</th>
                {series.map((s) => <td key={s.key} className="text-end text-white">{format(row[s.key])}</td>)}
                <td className={`text-end ${row.added ? "text-success fw-semibold" : "text-secondary"}`}>{row.added ? `+${format(row.added)}` : format(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
