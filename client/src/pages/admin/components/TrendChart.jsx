import { useEffect, useRef, useState } from "react";

// The Overview graphs. TrendChart draws ONE column chart (one column per day,
// drawn by hand as SVG, no chart library) and TrendTable lists the same numbers
// as a table for people who prefer to read them. Both take the rows sent by the
// database function admin_trends(): one row per day, oldest first.
//
// TrendChart props:
//   title       the heading, e.g. "New users"
//   totalLabel  what the big number counts, e.g. "new users"
//   data        the rows: { day: "2026-10-24", freelancers: 2, ... }
//   series      what to draw, bottom of the stack first:
//               [{ key: "freelancers", label: "Freelancers", color: "var(--trend-orange)" }]
//               One series = one color and no legend; two or more get a legend
//               and are stacked on top of each other.
//   days        how many days are shown (only used in the sentence under the title)

const HEIGHT = 210;
const MARGIN = { top: 10, right: 6, bottom: 26, left: 30 };
const MAX_COLUMN = 24; // a column is never wider than this, extra room stays empty
const GAP = 2; // empty space between touching columns and stacked pieces
const ROUND = 4; // rounded corner at the top end of a column
const LABEL_SPACE = 64; // room for one date label on the bottom axis

// "2026-10-24" -> a Date at local midnight. new Date("2026-10-24") would be read
// as UTC and could show the day before, so the parts are used one by one.
function parseDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}
const shortDay = (day) => parseDay(day).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const longDay = (day) => parseDay(day).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

// Whole-number tick marks up the side (a count of people is never 1.5): the
// smallest step that gives no more than 4 gaps, and a top that is a multiple of it.
function niceTicks(max) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const target = Math.max(max, 2);
  const step = steps.find((s) => Math.ceil(target / s) <= 4) ?? 1000;
  const top = Math.ceil(target / step) * step;
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

// A column whose TOP corners are rounded and whose bottom is square (it sits on
// the baseline or on the piece below it).
function columnPath(x, y, width, height, round) {
  const r = Math.min(round, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
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

export function TrendChart({ title, totalLabel, data, series, days }) {
  const [boxRef, width] = useWidth();
  // The day the pointer (or the arrow keys) is on, or null.
  const [active, setActive] = useState(null);

  const totals = series.map((s) => data.reduce((sum, row) => sum + (row[s.key] || 0), 0));
  const grandTotal = totals.reduce((sum, n) => sum + n, 0);
  const dayTotal = (row) => series.reduce((sum, s) => sum + (row[s.key] || 0), 0);

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { top, ticks } = niceTicks(Math.max(0, ...data.map(dayTotal)));
  const slot = data.length ? plotWidth / data.length : 0;
  // Packed tight (90 days on a phone) the gap shrinks to 1px so the columns stay visible.
  const columnWidth = Math.max(1, Math.min(MAX_COLUMN, slot - (slot >= 8 ? GAP : 1)));
  const unit = plotHeight / top; // pixels per 1 new item
  const baseY = MARGIN.top + plotHeight;

  // Which day is under the pointer.
  function dayAt(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - box.left - MARGIN.left) / slot);
    return index >= 0 && index < data.length ? index : null;
  }

  function onKeyDown(event) {
    if (!data.length) return;
    const last = data.length - 1;
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
  const every = Math.max(1, Math.ceil(LABEL_SPACE / (slot || 1)));
  const labelDays = [];
  for (let i = data.length - 1; i >= 0; i -= every) labelDays.push(i);

  const activeRow = active === null ? null : data[active];
  // The tooltip sits over the middle of the active column, kept inside the box.
  const tipLeft = active === null ? 0 : Math.min(Math.max(MARGIN.left + (active + 0.5) * slot, 75), Math.max(width - 75, 75));

  return (
    <div className="admin-card rounded-4 p-3 h-100">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
        <div>
          <h3 className="h6 fw-bold text-white mb-0">{title}</h3>
          <div className="text-secondary fs-8">Last {days} days</div>
        </div>
        <div className="text-end">
          <div className="admin-trend-total">{grandTotal}</div>
          <div className="text-secondary fs-8">{totalLabel}</div>
        </div>
      </div>

      {/* A legend only when there is more than one color to explain. */}
      {series.length > 1 && (
        <ul className="admin-trend-legend list-unstyled d-flex flex-wrap gap-3 mb-2">
          {series.map((s, index) => (
            <li key={s.key} className="d-flex align-items-center gap-2 fs-8 text-white-50">
              <span className="admin-trend-swatch" style={{ background: s.color }}></span>
              {s.label}
              <strong className="text-white">{totals[index]}</strong>
            </li>
          ))}
        </ul>
      )}

      <div
        className="admin-trend-box"
        ref={boxRef}
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="group"
        aria-label={`${title}, one column per day. Use the left and right arrow keys to read each day.`}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {grandTotal === 0 ? (
          <div className="admin-trend-empty text-secondary fs-7">No {totalLabel} in this period.</div>
        ) : (
          width > 0 && (
            <svg
              width={width}
              height={HEIGHT}
              aria-hidden="true"
              onPointerMove={(event) => setActive(dayAt(event))}
              onPointerDown={(event) => setActive(dayAt(event))}
              onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
            >
              {/* Side numbers and the thin lines behind the columns. */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    className={tick === 0 ? "admin-trend-base" : "admin-trend-grid"}
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={baseY - tick * unit}
                    y2={baseY - tick * unit}
                  />
                  <text className="admin-trend-axis" x={MARGIN.left - 8} y={baseY - tick * unit + 4} textAnchor="end">{tick}</text>
                </g>
              ))}

              {data.map((row, index) => {
                const x = MARGIN.left + index * slot + (slot - columnWidth) / 2;
                // Stack the series bottom to top; only the highest piece gets round corners.
                const pieces = series.filter((s) => (row[s.key] || 0) > 0);
                let cursor = baseY;
                return (
                  <g key={row.day}>
                    {active === index && <rect className="admin-trend-wash" x={MARGIN.left + index * slot} y={MARGIN.top} width={slot} height={plotHeight} />}
                    {pieces.map((s, pieceIndex) => {
                      const full = row[s.key] * unit;
                      // A 2px gap above the piece below it, so touching pieces stay apart.
                      const height = pieceIndex === 0 ? full : Math.max(full - GAP, 1);
                      const y = cursor - full;
                      cursor -= full;
                      const isTop = pieceIndex === pieces.length - 1;
                      return <path key={s.key} d={columnPath(x, y, columnWidth, height, isTop ? ROUND : 0)} style={{ fill: s.color }} />;
                    })}
                  </g>
                );
              })}

              {labelDays.map((index, order) => (
                <text
                  key={data[index].day}
                  className="admin-trend-axis"
                  // The newest label ends at the right edge so it is not cut off.
                  x={order === 0 ? width - MARGIN.right : MARGIN.left + (index + 0.5) * slot}
                  y={HEIGHT - 6}
                  textAnchor={order === 0 ? "end" : "middle"}
                >
                  {shortDay(data[index].day)}
                </text>
              ))}
            </svg>
          )
        )}

        {activeRow && grandTotal > 0 && (
          <div className="admin-trend-tip" style={{ left: tipLeft }}>
            <div className="text-white-50 fs-8 mb-1">{longDay(activeRow.day)}</div>
            {series.map((s) => (
              <div key={s.key} className="d-flex align-items-center gap-2">
                <span className="admin-trend-key" style={{ background: s.color }}></span>
                <strong className="text-white">{activeRow[s.key] || 0}</strong>
                <span className="text-white-50 fs-8">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Read out by screen readers while the arrow keys or pointer move. */}
      <span className="visually-hidden" aria-live="polite">
        {activeRow ? `${longDay(activeRow.day)}: ${series.map((s) => `${activeRow[s.key] || 0} ${s.label}`).join(", ")}` : ""}
      </span>
    </div>
  );
}

// The same numbers as a table, newest day first. Shown instead of the graphs
// when "Table" is picked. Every number the graphs show can be read here.
const tableColumns = [
  { key: "freelancers", label: "Freelancers" },
  { key: "clients", label: "Clients" },
  { key: "services", label: "Services" },
  { key: "job_posts", label: "Job posts" },
  { key: "reports", label: "Reports" },
  { key: "verifications", label: "Verifications" }
];

export function TrendTable({ data }) {
  const rows = [...data].reverse();
  return (
    <div className="admin-card rounded-4 p-3">
      <div className="table-responsive admin-trend-table">
        <table className="table table-dark align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Day</th>
              {tableColumns.map((column) => <th scope="col" key={column.key} className="text-end">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day}>
                <th scope="row" className="fw-normal text-nowrap">{longDay(row.day)}</th>
                {tableColumns.map((column) => (
                  <td key={column.key} className={`text-end ${row[column.key] ? "text-white fw-semibold" : "text-secondary"}`}>{row[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
