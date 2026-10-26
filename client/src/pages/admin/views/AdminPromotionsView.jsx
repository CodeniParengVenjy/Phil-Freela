import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { formatDay } from "../../../lib/billboards";
import { formatPeso, formatReference } from "../../../lib/payments";
import {
  PROMO_KINDS, approveRequest, getAnsweredRequests, getPrices, getRunning, getSiteGcash,
  getWaitingRequests, openPromoReceipt, rejectRequest
} from "../../../lib/promotions";
import PromotionRequestCard from "../components/PromotionRequestCard";
import PromotionSettings from "../components/PromotionSettings";

const TABS = [
  { key: "waiting", label: "Waiting" },
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

// Admin panel > Promotions: the fees people pay PhilFreela. Someone who wants a
// Featured post or Freelancer Pro pays PhilFreela's own GCash number and sends the
// reference and a receipt; an admin checks PhilFreela's own GCash and approves or
// rejects here. Any admin can answer; only a super admin changes the Settings
// (PhilFreela's GCash number and QR, and the prices). See PLAN-monetization.md.
export default function AdminPromotionsView() {
  const { adminId, isSuperAdmin, refreshPendingPromotions } = useOutletContext();
  const [tab, setTab] = useState("waiting");
  // Each is null until it has loaded.
  const [waiting, setWaiting] = useState(null);
  const [running, setRunning] = useState(null);
  const [answered, setAnswered] = useState(null);
  // PhilFreela's GCash row: undefined while loading, null when not set yet.
  const [gcash, setGcash] = useState(undefined);
  const [prices, setPrices] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ text: "", type: "" });
  // The request being answered, so its buttons wait.
  const [busyId, setBusyId] = useState(null);

  const setError = (key, text) => setErrors((prev) => ({ ...prev, [key]: text }));

  // PhilFreela's GCash details and the prices: needed for the warning banner and
  // the Settings tab, so they load once, straight away.
  useEffect(() => {
    let active = true;
    (async () => {
      const [gcashResult, pricesResult] = await Promise.all([getSiteGcash(), getPrices()]);
      if (!active) return;
      if (gcashResult.error) setError("settings", gcashResult.error);
      else setGcash(gcashResult.gcash);
      if (pricesResult.error) setError("settings", pricesResult.error);
      else setPrices(pricesResult.prices);
    })();
    return () => { active = false; };
  }, []);

  // Each tab reloads its list whenever it is opened, so it is never out of date.
  useEffect(() => {
    let active = true;
    (async () => {
      if (tab === "waiting") {
        const { data, error } = await getWaitingRequests();
        if (!active) return;
        if (error) setError("waiting", "Failed to load the payments waiting for you.");
        else { setWaiting(data); setError("waiting", ""); }
      } else if (tab === "running") {
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

  const say = (text, type = "success") => setMessage({ text, type });

  // A request somebody else (or an earlier click) already answered: show the
  // sentence and bring the list up to date.
  const reloadWaiting = async () => {
    const { data } = await getWaitingRequests();
    if (data) setWaiting(data);
    refreshPendingPromotions?.();
  };

  const handleApprove = async (request) => {
    const who = personName(request.person);
    if (!window.confirm(`Approve ${formatPeso(request.amount)} from ${who}?\n\nOnly do this after you see it in PhilFreela's own GCash.`)) return;
    setBusyId(request.id);
    const problem = await approveRequest(request.id);
    setBusyId(null);
    if (problem) {
      say(problem, "error");
      if (/already answered/i.test(problem)) reloadWaiting();
      return;
    }
    setWaiting((prev) => prev.filter((r) => r.id !== request.id));
    refreshPendingPromotions?.();
    say(`Approved ${formatPeso(request.amount)} from ${who}. They were told.`);
  };

  // Returns true when it was rejected, so the card can close its reason box.
  const handleReject = async (request, reason) => {
    setBusyId(request.id);
    const problem = await rejectRequest(request.id, reason);
    setBusyId(null);
    if (problem) {
      say(problem, "error");
      if (/already answered/i.test(problem)) reloadWaiting();
      return false;
    }
    setWaiting((prev) => prev.filter((r) => r.id !== request.id));
    refreshPendingPromotions?.();
    say(`Rejected ${formatPeso(request.amount)} from ${personName(request.person)}. They were told why.`);
    return true;
  };

  const handleOpenReceipt = async (request) => {
    const problem = await openPromoReceipt(request.receipt_path);
    if (problem) say(problem, "error");
  };

  const waitingCount = waiting?.length ?? 0;

  // Featured posts split by the list they appear in.
  const offers = running?.featured?.filter((row) => row.service_id) ?? [];
  const jobs = running?.featured?.filter((row) => row.job_id) ?? [];

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Promotions</h1>
      <p className="text-white-50 fs-7 mb-3">
        Fees people pay PhilFreela. A Featured post is paid to PhilFreela's own GCash with a reference and a receipt: check your GCash, then approve or reject. Freelancer Pro is paid online on Xendit and starts by itself; it shows up in History.
      </p>

      <div className="d-flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Promotions">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`btn btn-sm rounded-pill px-3 ${tab === key ? "btn-admin-orange fw-bold" : "btn-outline-light"}`}
            onClick={() => { setTab(key); setMessage({ text: "", type: "" }); }}
          >
            {label}
            {key === "waiting" && waitingCount > 0 && <span className="badge rounded-pill bg-danger ms-2">{waitingCount}</span>}
          </button>
        ))}
      </div>

      {message.text && <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>}

      {/* ---- Waiting ---- */}
      {tab === "waiting" && (
        <>
          {gcash === null && (
            <div className="admin-card rounded-4 p-3 mb-3 d-flex align-items-start gap-3">
              <span className="admin-stat-icon admin-stat-orange"><i className="bi bi-exclamation-triangle-fill"></i></span>
              <div>
                <div className="fw-bold text-white">PhilFreela's GCash number isn't set yet</div>
                <div className="text-secondary fs-7">
                  Nobody can pay a fee until a super admin sets it in the{" "}
                  <button type="button" className="btn btn-link p-0 align-baseline text-white" onClick={() => setTab("settings")}>Settings</button> tab.
                </div>
              </div>
            </div>
          )}
          {errors.waiting && <div className="admin-card rounded-4 p-4 text-center text-white-50">{errors.waiting}</div>}
          {!errors.waiting && waiting === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the payments...</div>}
          {!errors.waiting && waiting?.length === 0 && (
            <div className="admin-card rounded-4 p-4 text-center text-white-50">
              <i className="bi bi-cash-coin fs-1 d-block mb-2"></i>
              Nothing is waiting. New payments appear here.
            </div>
          )}
          <div className="d-flex flex-column gap-3">
            {waiting?.map((request) => (
              <PromotionRequestCard
                key={request.id}
                request={request}
                busy={busyId === request.id}
                onApprove={handleApprove}
                onReject={handleReject}
                onOpenReceipt={handleOpenReceipt}
              />
            ))}
          </div>
        </>
      )}

      {/* ---- Running now ---- */}
      {tab === "running" && (
        <>
          {errors.running && <div className="admin-card rounded-4 p-4 text-center text-white-50">{errors.running}</div>}
          {!errors.running && !running && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading what is running...</div>}
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
                    <h2 className="h6 fw-bold text-white mb-0">Freelancer Pro members</h2>
                    <span className="text-secondary fs-7">{running.pro.length} now</span>
                  </div>
                  {running.pro.length === 0 && <p className="text-secondary fs-7 mb-0">Nobody is a Pro member right now.</p>}
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
          {!errors.history && !answered && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the history...</div>}
          {!errors.history && answered?.length === 0 && (
            <div className="admin-card rounded-4 p-4 text-center text-white-50">Nothing has been answered yet.</div>
          )}
          <div className="d-flex flex-column gap-3">
            {answered?.map((request) => {
              const approved = request.status === "approved";
              const kind = PROMO_KINDS[request.kind];
              // Paid on Xendit's page (Freelancer Pro): no reference, receipt or admin.
              const online = request.method === "online";
              return (
                <div key={request.id} className="admin-card rounded-4 p-3">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <span className={`badge fw-normal ${approved ? "bg-success" : "bg-danger"}`}>{online ? "Paid online" : approved ? "Approved" : "Rejected"}</span>
                    {/* Paid with Xendit's test keys: pretend money, left out of Earnings. */}
                    {online && request.test_mode && <span className="badge bg-warning text-dark fw-normal">TEST</span>}
                    <span className="badge bg-info text-dark fw-normal">{kind.label}</span>
                    <span className="fw-bold text-white">{formatPeso(request.amount)}</span>
                    <span className="text-white-50 fs-8 ms-auto">{new Date(request.decided_at).toLocaleString()}</span>
                  </div>
                  <div className="text-white admin-description">
                    {request.kind === "pro" ? `${request.days} days of Freelancer Pro` : `${request.days} days for "${request.target_title || "a removed post"}"`}
                    {" "}from{" "}
                    {request.person ? (
                      <Link to={`/admin/users?search=${encodeURIComponent(request.person.username)}`} className="text-white fw-semibold">{request.person.full_name}</Link>
                    ) : "a removed account"}
                  </div>
                  <div className="text-white-50 fs-8">
                    {online
                      ? <>Paid on Xendit · payment {request.provider_payment_id}</>
                      : <>Reference {formatReference(request.reference_no)} · answered by {request.decider?.full_name || "a removed admin"}</>}
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
          {!errors.settings && (gcash === undefined || prices === null) && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading the settings...</div>}
          {gcash !== undefined && prices !== null && (
            <PromotionSettings
              isSuperAdmin={isSuperAdmin}
              adminId={adminId}
              gcash={gcash}
              prices={prices}
              onGcashSaved={setGcash}
              onPriceSaved={(saved) => setPrices((prev) => prev.map((option) => (option.code === saved.code ? saved : option)))}
            />
          )}
        </>
      )}
    </section>
  );
}
