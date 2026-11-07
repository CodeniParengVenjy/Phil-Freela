import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { formatDay } from "../../../lib/billboards";
import { formatPeso } from "../../../lib/payments";
import { PROMO_KINDS, getAnsweredRequests, getPrices, getRunning } from "../../../lib/promotions";
import PromotionSettings from "../components/PromotionSettings";
import { Loader } from "../../../components/Loaders";

const TABS = [
  { key: "running", label: "Running now" },
  { key: "history", label: "History" },
  { key: "settings", label: "Settings" }
];

// How many Featured spots each list has (the same number as the database).
const SPOTS = 3;

// "Nov 3, 2026, 4:20 PM" in Manila time, for a moment a period ends.
const formatUntil = (moment) =>
  new Date(moment).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const personName = (person) => (person ? `${person.full_name} (@${person.username})` : "a removed account");

// Admin panel > Promotions: the fees people pay PhilFreela. Featured posts,
// Community ads and Premium are paid online on Xendit and start by themselves, so
// nobody here checks a payment: Running now shows what is on, History lists what
// was paid, and only a super admin changes the Settings (the prices). See
// PLAN-monetization.md.
export default function AdminPromotionsView() {
  const { isSuperAdmin } = useOutletContext();
  const [tab, setTab] = useState("running");
  // Each is null until it has loaded.
  const [running, setRunning] = useState(null);
  const [answered, setAnswered] = useState(null);
  const [prices, setPrices] = useState(null);
  const [errors, setErrors] = useState({});

  const setError = (key, text) => setErrors((prev) => ({ ...prev, [key]: text }));

  // The prices are needed for the Settings tab, so they load once, straight away.
  useEffect(() => {
    let active = true;
    (async () => {
      const pricesResult = await getPrices();
      if (!active) return;
      if (pricesResult.error) setError("settings", pricesResult.error);
      else setPrices(pricesResult.prices);
    })();
    return () => { active = false; };
  }, []);

  // Each tab reloads its list whenever it is opened, so it is never out of date.
  useEffect(() => {
    let active = true;
    (async () => {
      if (tab === "running") {
        const result = await getRunning();
        if (!active) return;
        if (result.error) setError("running", result.error);
        else { setRunning(result); setError("running", ""); }
      } else if (tab === "history") {
        const { data, error } = await getAnsweredRequests();
        if (!active) return;
        if (error) setError("history", "Failed to load the history.");
        else { setAnswered(data); setError("history", ""); }
      }
    })();
    return () => { active = false; };
  }, [tab]);

  // Featured posts split by the list they appear in.
  const offers = running?.featured?.filter((row) => row.service_id) ?? [];
  const jobs = running?.featured?.filter((row) => row.job_id) ?? [];

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Promotions</h1>
      <p className="text-white-50 fs-7 mb-3">
        Fees people pay PhilFreela. Featured posts, Community ads and Premium are paid online on Xendit and start by themselves; they show up in History.
      </p>

      <div className="d-flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Promotions">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`btn btn-sm rounded-pill px-3 ${tab === key ? "btn-admin-orange fw-bold" : "btn-outline-light"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- Running now ---- */}
      {tab === "running" && (
        <>
          {errors.running && <div className="admin-card rounded-4 p-4 text-center text-white-50">{errors.running}</div>}
          {!errors.running && !running && <div className="admin-card rounded-4 p-4"><Loader label="Loading what is running" /></div>}
          {running && (
            <div className="row g-3">
              <div className="col-12 col-lg-6">
                <div className="admin-card rounded-4 p-3 h-100">
                  <div className="d-flex justify-content-between align-items-baseline gap-3 mb-2">
                    <h2 className="h6 fw-bold text-white mb-0">Featured offers</h2>
                    <span className="text-secondary fs-7">{offers.length} of {SPOTS} spots used</span>
                  </div>
                  {offers.length === 0 && <p className="text-secondary fs-7 mb-0">No offer is Featured right now.</p>}
                  <ul className="list-unstyled d-grid gap-2 mb-0">
                    {offers.map((row) => (
                      <li key={row.id}>
                        <div className="text-white fw-semibold admin-description">{row.service?.title || "A removed offer"}</div>
                        <div className="text-secondary fs-8">{row.service?.freelancer ? `${row.service.freelancer.full_name} (@${row.service.freelancer.username})` : "a removed account"} · until {formatUntil(row.featured_until)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="admin-card rounded-4 p-3 h-100">
                  <div className="d-flex justify-content-between align-items-baseline gap-3 mb-2">
                    <h2 className="h6 fw-bold text-white mb-0">Featured job posts</h2>
                    <span className="text-secondary fs-7">{jobs.length} of {SPOTS} spots used</span>
                  </div>
                  {jobs.length === 0 && <p className="text-secondary fs-7 mb-0">No job post is Featured right now.</p>}
                  <ul className="list-unstyled d-grid gap-2 mb-0">
                    {jobs.map((row) => (
                      <li key={row.id}>
                        <div className="text-white fw-semibold admin-description">{row.job?.title || "A removed job post"}</div>
                        <div className="text-secondary fs-8">{row.job?.client ? `${row.job.client.full_name} (@${row.job.client.username})` : "a removed account"} · until {formatUntil(row.featured_until)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="col-12">
                <div className="admin-card rounded-4 p-3">
                  <div className="d-flex justify-content-between align-items-baseline gap-3 mb-2">
                    <h2 className="h6 fw-bold text-white mb-0">Premium members</h2>
                    <span className="text-secondary fs-7">{running.pro.length} now</span>
                  </div>
                  {running.pro.length === 0 && <p className="text-secondary fs-7 mb-0">Nobody is a Premium member right now.</p>}
                  <ul className="list-unstyled d-grid gap-2 mb-0">
                    {running.pro.map((row) => (
                      <li key={row.user_id}>
                        <span className="text-white fw-semibold">{personName(row.person)}</span>
                        <span className="text-secondary fs-8"> · until {formatUntil(row.pro_until)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- History ---- */}
      {tab === "history" && (
        <>
          {errors.history && <div className="admin-card rounded-4 p-4 text-center text-white-50">{errors.history}</div>}
          {!errors.history && !answered && <div className="admin-card rounded-4 p-4"><Loader label="Loading the history" /></div>}
          {!errors.history && answered?.length === 0 && (
            <div className="admin-card rounded-4 p-4 text-center text-white-50">Nothing has been paid yet.</div>
          )}
          <div className="d-flex flex-column gap-3">
            {answered?.map((request) => {
              const approved = request.status === "approved";
              const kind = PROMO_KINDS[request.kind];
              // Paid on Xendit's page: no admin. A free Featured post (a Premium perk) has no payment at all.
              const online = request.method === "online";
              const free = request.method === "free";
              return (
                <div key={request.id} className="admin-card rounded-4 p-3">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <span className={`badge fw-normal ${approved ? "bg-success" : "bg-danger"}`}>{online ? "Paid online" : free ? "Free with Premium" : approved ? "Approved" : "Rejected"}</span>
                    <span className="badge bg-info text-dark fw-normal">{kind.label}</span>
                    <span className="fw-bold text-white">{formatPeso(request.amount)}</span>
                    <span className="text-white-50 fs-8 ms-auto">{new Date(request.decided_at).toLocaleString()}</span>
                  </div>
                  <div className="text-white admin-description">
                    {request.kind === "pro" ? `${request.days} days of Premium` : `${request.days} days for "${request.target_title || "a removed post"}"`}
                    {" "}from{" "}
                    {request.person ? (
                      <Link to={`/admin/users?search=${encodeURIComponent(request.person.username)}`} className="text-white fw-semibold">{request.person.full_name}</Link>
                    ) : "a removed account"}
                  </div>
                  <div className="text-white-50 fs-8">
                    {online
                      ? <>Paid on Xendit · payment {request.provider_payment_id}</>
                      : free
                        ? <>The free Featured post a Premium member gets every 30 days</>
                        : <>Answered by {request.decider?.full_name || "a removed admin"}</>}
                    {approved && request.starts_at && request.ends_at && <> · ran from {formatDay(request.starts_at)} to {formatDay(new Date(request.ends_at).getTime() - 1)}</>}
                  </div>
                  {!approved && request.reject_reason && <div className="fs-7 text-white-50 mt-1">Reason: {request.reject_reason}</div>}
                </div>
              );
            })}
          </div>
          {answered?.length === 50 && <p className="text-white-50 fs-8 mt-3 mb-0">Showing the last 50.</p>}
        </>
      )}

      {/* ---- Settings ---- */}
      {tab === "settings" && (
        <>
          {errors.settings && <div className="admin-card rounded-4 p-4 text-center text-white-50">{errors.settings}</div>}
          {!errors.settings && prices === null && <div className="admin-card rounded-4 p-4"><Loader label="Loading the settings" /></div>}
          {prices !== null && (
            <PromotionSettings
              isSuperAdmin={isSuperAdmin}
              prices={prices}
              onPriceSaved={(saved) => setPrices((prev) => prev.map((option) => (option.code === saved.code ? saved : option)))}
            />
          )}
        </>
      )}
    </section>
  );
}
