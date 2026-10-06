import { useEffect, useState } from "react";
import { billboardImageUrl, getMyBillboards } from "../../../lib/billboards";

// How long each billboard shows before the next one, when there are several.
const TURN_MS = 8000;

// The billboard on the dashboard home: a welcome message or an advertisement
// posted by an admin (admin panel > Billboard), with a picture when it has
// one. The database only sends the ones that are on and meant for this user
// (lib/billboards.js). With no billboard, nothing is drawn and the dashboard
// looks the way it did before.
export default function DashboardBillboard() {
  const [billboards, setBillboards] = useState([]);
  const [index, setIndex] = useState(0);
  // Pointing at the billboard (or tabbing into it) holds it still, so there
  // is time to read it.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let active = true;
    getMyBillboards().then((rows) => {
      if (active) setBillboards(rows);
    });
    return () => { active = false; };
  }, []);

  // Several billboards take turns. People who asked their device for less
  // motion keep the first one and use the dots instead.
  useEffect(() => {
    if (billboards.length < 2 || paused) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % billboards.length), TURN_MS);
    return () => clearInterval(timer);
  }, [billboards.length, paused]);

  if (billboards.length === 0) return null;
  const billboard = billboards[index % billboards.length];

  return (
    <section
      className="dashboard-billboard glass-card rounded-4 mb-4 border border-secondary border-opacity-25 overflow-hidden"
      aria-label="Billboard"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* The key makes each billboard fade in when it takes its turn. */}
      <div className="dashboard-billboard-slide" key={billboard.id}>
        {billboard.image_path && (
          // The headline right under the picture says what it shows, so the
          // picture itself needs no description (alt="").
          <img src={billboardImageUrl(billboard.image_path)} alt="" className="dashboard-billboard-picture" />
        )}
        <div className="p-3 p-md-4 d-flex align-items-center gap-3">
          {!billboard.image_path && (
            <div className="rounded-circle bg-role-subtle text-role d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 48, height: 48 }}>
              <i className="bi bi-megaphone-fill fs-5"></i>
            </div>
          )}
          <div className="flex-grow-1 min-w-0">
            <h2 className="h5 text-white fw-bold mb-1 text-break">{billboard.title}</h2>
            {billboard.message && (
              <p className="text-secondary fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{billboard.message}</p>
            )}
          </div>
        </div>
      </div>

      {billboards.length > 1 && (
        <div className="dashboard-billboard-dots">
          {billboards.map((item, position) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-billboard-dot${position === index ? " is-current" : ""}`}
              aria-label={`Show billboard ${position + 1} of ${billboards.length}`}
              aria-current={position === index}
              onClick={() => setIndex(position)}
            ></button>
          ))}
        </div>
      )}
    </section>
  );
}
