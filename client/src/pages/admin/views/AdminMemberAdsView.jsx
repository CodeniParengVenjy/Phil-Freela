import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getAnsweredAds, getRunningAds, getWaitingAds, reviewAd, takeDownAd } from "../../../lib/adminMemberAds";
import { formatDay } from "../../../lib/billboards";
import { AD_AUDIENCES, AD_STATES, MAX_SPOTS, adButton, adImageUrl, adPrice, adState, getAdPrices } from "../../../lib/memberAds";
import { formatPeso } from "../../../lib/payments";
import { useProIds } from "../../../lib/pro";
import { MAX_REASON, MIN_REASON } from "../../../lib/promotions";
import { useVerifiedIds } from "../../../lib/useVerifiedIds";
import MemberAdSlide from "../../dashboard/components/MemberAdSlide";

const audienceLabel = (value) => AD_AUDIENCES.find((item) => item.value === value)?.label || "Everyone";
const personLine = (person) => (person ? `${person.full_name} (@${person.username}, ${person.account_type})` : "a removed account");

// Admin panel > Site > Community Billboard: the ads members send to be shown on other
// members' dashboards. Any admin answers: Approve (the poster is told to pay on
// Xendit; the ad goes live when they have) or Reject with a reason the poster reads.
// A running ad that breaks a rule is taken down, also with a reason. The database
// rules decide who may do what (database/supabase_community_billboard_schema.sql).
// See PLAN-community-billboard.md.
export default function AdminMemberAdsView() {
  const { refreshPendingMemberAds } = useOutletContext();
  // Each is null until it has loaded.
  const [waiting, setWaiting] = useState(null);
  const [running, setRunning] = useState(null);
  const [answered, setAnswered] = useState(null);
  const [prices, setPrices] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The ad whose buttons wait, and the ad that is asking for a reason ("reject" or
  // "takedown") with the reason typed so far.
  const [busyId, setBusyId] = useState(null);
  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState("");
  const [round, setRound] = useState(0);

  const proIds = useProIds();
  const verifiedIds = useVerifiedIds([...(waiting || []), ...(running || [])].map((ad) => ad.owner_id));

  useEffect(() => {
    let active = true;
    Promise.all([getWaitingAds(), getRunningAds(), getAnsweredAds(), getAdPrices()]).then(([waitingResult, runningResult, answeredResult, priceResult]) => {
      if (!active) return;
      setLoadError(waitingResult.error || runningResult.error || answeredResult.error || "");
      if (waitingResult.ads) setWaiting(waitingResult.ads);
      if (runningResult.ads) setRunning(runningResult.ads);
      if (answeredResult.ads) setAnswered(answeredResult.ads);
      setPrices(priceResult.prices || []);
    });
    return () => {
      active = false;
    };
  }, [round]);

  const startAsking = (ad, kind) => {
    setAsking({ id: ad.id, kind });
    setReason("");
    setMessage({ text: "", type: "" });
  };
  const stopAsking = () => {
    setAsking(null);
    setReason("");
  };

  // Runs one answer, then reads the lists again and refreshes the number on the menu.
  const finish = async (ad, problem, success) => {
    setBusyId(null);
    if (problem) {
      setMessage({ text: problem, type: "error" });
      return;
    }
    stopAsking();
    setMessage({ text: success, type: "success" });
    setRound((value) => value + 1);
    refreshPendingMemberAds();
  };

  const handleApprove = async (ad) => {
    setBusyId(ad.id);
    await finish(ad, await reviewAd(ad.id, true), `"${ad.title}" was approved. The poster was told to pay.`);
  };

  // Rejecting and taking down both need a reason the poster reads.
  const handleWithReason = async (ad, kind) => {
    const why = reason.trim();
    if (why.length < MIN_REASON || why.length > MAX_REASON) {
      setMessage({ text: `Write a reason of ${MIN_REASON} to ${MAX_REASON} characters so the poster knows why.`, type: "error" });
      return;
    }
    setBusyId(ad.id);
    if (kind === "reject") await finish(ad, await reviewAd(ad.id, false, why), `"${ad.title}" was rejected. The poster was told why.`);
    else await finish(ad, await takeDownAd(ad.id, why), `"${ad.title}" was taken down. The poster was told why.`);
  };

  // What the poster pays for this ad (Premium members pay half).
  const priceText = (ad) => {
    const row = prices.find((item) => item.code === ad.price_code);
    if (!row) return "";
    const premium = proIds.has(ad.owner_id);
    return `, ${premium ? "Premium price " : ""}${formatPeso(adPrice(row, premium))}`;
  };

  const adCard = (ad, buttons) => (
    <div key={ad.id} className="admin-card rounded-4 p-3 p-md-4">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="badge admin-badge-orange fw-normal">{audienceLabel(ad.audience)}</span>
        <span className="badge bg-secondary fw-normal">{ad.days} days{priceText(ad)}</span>
        <span className="text-white-50 fs-8 ms-auto">
          {ad.status === "paid" ? `Until ${formatDay(ad.ends_at)}` : `Sent ${new Date(ad.created_at).toLocaleString()}`}
        </span>
      </div>
      <div className="rounded-3 overflow-hidden border border-secondary border-opacity-25 bg-black bg-opacity-25 mb-2">
        <MemberAdSlide
          small previewOnly
          ad={ad}
          owner={{ name: ad.owner?.full_name || "a member", verified: verifiedIds.has(ad.owner_id), premium: proIds.has(ad.owner_id) }}
          pictureUrl={adImageUrl(ad.image_path)}
          button={adButton(ad)}
          badgeClass="bg-info text-dark"
          buttonClass="btn btn-admin-orange btn-sm rounded-pill px-3 fw-bold flex-shrink-0"
        />
      </div>
      <p className="fs-8 text-white-50 mb-2"><i className="bi bi-person me-1"></i>{personLine(ad.owner)}</p>
      {buttons}
    </div>
  );

  // The reason box that opens under an ad being rejected or taken down.
  const reasonBox = (ad, kind) => (
    <div className="d-flex flex-wrap align-items-end gap-2">
      <div style={{ minWidth: 260, flex: 1 }}>
        <label htmlFor={`reason-${ad.id}`} className="form-label text-white-50 fs-8 mb-1">Why? The poster reads this ({MIN_REASON} to {MAX_REASON} letters)</label>
        <input
          id={`reason-${ad.id}`} type="text" className="form-control admin-input form-control-sm" maxLength={MAX_REASON}
          value={reason} onChange={(event) => setReason(event.target.value)} disabled={busyId === ad.id}
        />
      </div>
      <button className="btn btn-danger btn-sm" onClick={() => handleWithReason(ad, kind)} disabled={busyId === ad.id}>
        {kind === "reject" ? "Send rejection" : "Take it down"}
      </button>
      <button className="btn btn-outline-light btn-sm" onClick={stopAsking} disabled={busyId === ad.id}>Cancel</button>
    </div>
  );

  const history = (answered || []).filter((ad) => adState(ad) !== "running");

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Community Billboard</h1>
      <p className="text-white-50 fs-7 mb-3">
        Ads that members posted for other members. Approve or reject each one: the poster pays after you approve.
        Up to {MAX_SPOTS} can run at once{running ? ` (${running.length} of ${MAX_SPOTS} in use)` : ""}.
      </p>

      {message.text && <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>}
      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50 mb-3">{loadError}</div>}

      <h2 className="h6 fw-bold text-white mb-3">
        Waiting for review {waiting?.length > 0 && <span className="badge bg-warning text-dark rounded-pill ms-1">{waiting.length}</span>}
      </h2>
      {waiting === null && !loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50 mb-4">Loading ads...</div>}
      {waiting?.length === 0 && <div className="admin-card rounded-4 p-4 text-center text-white-50 mb-4">Nothing is waiting for review.</div>}
      <div className="d-flex flex-column gap-3 mb-4">
        {waiting?.map((ad) => adCard(ad, asking?.id === ad.id && asking.kind === "reject" ? reasonBox(ad, "reject") : (
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-admin-orange btn-sm" onClick={() => handleApprove(ad)} disabled={busyId === ad.id}><i className="bi bi-check-lg"></i> Approve</button>
            <button className="btn btn-outline-danger btn-sm" onClick={() => startAsking(ad, "reject")} disabled={busyId === ad.id}><i className="bi bi-x-lg"></i> Reject</button>
          </div>
        )))}
      </div>

      <h2 className="h6 fw-bold text-white mb-3">
        Running now {running?.length > 0 && <span className="badge bg-success rounded-pill ms-1">{running.length}</span>}
      </h2>
      {running?.length === 0 && <div className="admin-card rounded-4 p-4 text-center text-white-50 mb-4">No member ad is running.</div>}
      <div className="d-flex flex-column gap-3 mb-4">
        {running?.map((ad) => adCard(ad, asking?.id === ad.id && asking.kind === "takedown" ? reasonBox(ad, "takedown") : (
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-danger btn-sm" onClick={() => startAsking(ad, "takedown")} disabled={busyId === ad.id}><i className="bi bi-slash-circle"></i> Take down</button>
          </div>
        )))}
      </div>

      <h2 className="h6 fw-bold text-white mb-3">History</h2>
      {answered !== null && history.length === 0 && <div className="admin-card rounded-4 p-4 text-center text-white-50">No answered ads yet.</div>}
      <div className="d-flex flex-column gap-2">
        {history.map((ad) => {
          const badge = AD_STATES[adState(ad)];
          return (
            <div key={ad.id} className="admin-card rounded-4 p-3">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`badge fw-normal ${badge.className}`}>{badge.label}</span>
                <span className="fw-semibold text-white text-break">{ad.title}</span>
                <span className="text-white-50 fs-8 ms-auto">{new Date(ad.created_at).toLocaleDateString()}</span>
              </div>
              <p className="fs-8 text-white-50 mb-0 mt-1">
                {personLine(ad.owner)}, {ad.days} days
                {ad.reject_reason ? `. Reason: ${ad.reject_reason}` : ""}
                {ad.reviewer?.full_name ? `. Answered by ${ad.reviewer.full_name}.` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
