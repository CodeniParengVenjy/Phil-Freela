import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import CensoredText from "../../../components/CensoredText";
import { BILLBOARD_PICTURE_ACCEPT, checkBillboardPicture } from "../../../lib/billboards";
import { onlinePaymentsReady, startAdCheckout } from "../../../lib/checkout";
import { formatFeatureDate } from "../../../lib/featured";
import {
  ADS_CHANGED, AD_AUDIENCES, AD_STATES, MAX_AD_MESSAGE, MAX_AD_TITLE, MAX_SPOTS,
  adPrice, adState, checkAdText, getAdPrices, getLinkChoices, getMyAds, getSpotsLeft, requestAd, withdrawAd
} from "../../../lib/memberAds";
import { formatPeso } from "../../../lib/payments";
import { isPostingBlocked } from "../../../lib/suspensions";
import { fetchIsVerified } from "../../../lib/verification";
import BlockedNotice from "../components/BlockedNotice";
import MemberAdSlide from "../components/MemberAdSlide";
import "../memberAds.css";

const inputClass = "form-control bg-secondary bg-opacity-25 border-secondary text-white py-2";
const pill = (active) => `btn btn-sm rounded-pill px-3 fw-semibold ${active ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`;

// What the "button on your ad" choice opens, for the preview: { to, label }.
function previewButton(link) {
  if (link.startsWith("service:")) return { to: "#", label: "View my offer" };
  if (link.startsWith("job:")) return { to: "#", label: "View my job post" };
  if (link === "profile") return { to: "#", label: "View my profile" };
  return null;
}

// Advertise (PLAN-community-billboard.md): a verified freelancer or client writes an
// ad, an admin approves it, then they pay on Xendit and it runs on the Community
// Billboard (the strip on the dashboard home) for the days they bought. The form is
// on the left, "My Ads" with each ad's status on the right. The database decides who
// may send an ad and what it costs; this page only shows it.
export default function AdvertiseView() {
  const { currentUserId, displayName, showToast, suspension, isPro } = useOutletContext();
  const postingBlocked = isPostingBlocked(suspension);

  const [isVerified, setIsVerified] = useState(null);
  // { prices } or { error }; undefined while loading.
  const [priceResult, setPriceResult] = useState(undefined);
  const [choices, setChoices] = useState({ services: [], jobs: [] });
  // Can an approved ad be paid on Xendit yet (needs the updated server)? null while asked.
  const [payOnline, setPayOnline] = useState(null);
  const [ads, setAds] = useState(null);
  const [adsError, setAdsError] = useState("");
  const [spots, setSpots] = useState(null);
  const [round, setRound] = useState(0);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [code, setCode] = useState("ad_7");
  // "" (no button), "service:<id>", "job:<id>" or "profile".
  const [link, setLink] = useState("");
  const [picture, setPicture] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [payingId, setPayingId] = useState(null);
  // The ad that was asked "withdraw this ad?".
  const [withdrawingId, setWithdrawingId] = useState(null);
  const pictureInputRef = useRef(null);

  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;
    fetchIsVerified(currentUserId).then((verified) => {
      if (active) setIsVerified(verified);
    });
    getAdPrices().then((result) => {
      if (active) setPriceResult(result);
    });
    getLinkChoices(currentUserId).then((found) => {
      if (active) setChoices(found);
    });
    onlinePaymentsReady(3).then((ready) => {
      if (active) setPayOnline(ready);
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  // The person's ads and the free spots, read again after a change (round) or after a
  // payment was confirmed (ADS_CHANGED, sent by the dashboard when they come back from Xendit).
  useEffect(() => {
    if (!currentUserId) return undefined;
    let active = true;
    Promise.all([getMyAds(currentUserId), getSpotsLeft()]).then(([mine, left]) => {
      if (!active) return;
      if (mine.error) setAdsError(mine.error);
      else {
        setAdsError("");
        setAds(mine.ads);
      }
      setSpots(left);
    });
    return () => {
      active = false;
    };
  }, [currentUserId, round]);

  useEffect(() => {
    const reload = () => setRound((value) => value + 1);
    window.addEventListener(ADS_CHANGED, reload);
    return () => window.removeEventListener(ADS_CHANGED, reload);
  }, []);

  // Frees the picture preview when it is replaced or the page closes.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const prices = priceResult?.prices || [];
  const canPost = !postingBlocked && isVerified === true;

  const clearPicture = () => {
    setPicture(null);
    setPreviewUrl(null);
  };

  const handlePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!file) return;
    const problem = checkBillboardPicture(file);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError("");
    setPicture(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending || !canPost) return;
    const problem = checkAdText({ title, message });
    if (problem) {
      setFormError(problem);
      return;
    }
    setSending(true);
    setFormError("");
    const [kind, id] = link.split(":");
    const result = await requestAd({
      userId: currentUserId, title, message, picture, audience, code,
      link: kind ? { kind, id: id || null } : null
    });
    setSending(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    showToast("Your ad was sent. An admin will check it, and you'll get a notification.");
    setTitle("");
    setMessage("");
    setAudience("all");
    setCode("ad_7");
    setLink("");
    clearPicture();
    setRound((value) => value + 1);
  };

  // Goes to Xendit's page; it brings the person back here when they are done.
  const handlePay = async (ad) => {
    setPayingId(ad.id);
    const result = await startAdCheckout(ad.id);
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    setPayingId(null);
    showToast(result.error);
    // E.g. the spots filled up meanwhile: read the list again.
    setRound((value) => value + 1);
  };

  const handleWithdraw = async (ad) => {
    setWithdrawingId(null);
    const result = await withdrawAd(ad.id);
    showToast(result.error || `"${ad.title}" was withdrawn.`);
    setRound((value) => value + 1);
  };

  const audienceLabel = (value) => AD_AUDIENCES.find((item) => item.value === value)?.label || "Everyone";

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div data-tour="advertise-form" className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-1">
              <i className="bi bi-megaphone-fill text-role me-2"></i> Advertise on the Community Billboard
            </h3>
            <p className="text-secondary fs-7 mb-4">
              Your ad shows on the dashboard home of other members. An admin checks it first, and you pay only after it is approved.
            </p>

            {postingBlocked && <BlockedNotice suspension={suspension} what="post ads" />}
            {!postingBlocked && isVerified === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}

            {!postingBlocked && isVerified === false && (
              <div className="text-center py-4">
                <i className="bi bi-shield-lock text-warning" style={{ fontSize: "2.75rem" }}></i>
                <h5 className="text-white fw-bold mt-3 mb-2">Verify your identity to advertise</h5>
                <p className="text-secondary fs-7 mb-4 mx-auto" style={{ maxWidth: 460 }}>
                  To keep members safe, only accounts with a verified identity can post ads.
                  It takes a few minutes: a photo of your government ID and a quick face scan.
                </p>
                <Link to="/dashboard/verify-identity" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white">
                  <i className="bi bi-patch-check me-1"></i> Verify now
                </Link>
              </div>
            )}

            {canPost && (
              <form onSubmit={handleSubmit} noValidate>
                <label htmlFor="adTitle" className="form-label text-white fw-semibold fs-7">Headline:</label>
                <input
                  id="adTitle" type="text" className={`${inputClass} mb-1`} maxLength={MAX_AD_TITLE}
                  placeholder="e.g. Logo design for small shops" value={title}
                  onChange={(event) => setTitle(event.target.value)} disabled={sending}
                />
                <div className="text-secondary fs-8 text-end mb-3">{title.length}/{MAX_AD_TITLE}</div>

                <label htmlFor="adMessage" className="form-label text-white fw-semibold fs-7">Message (optional):</label>
                <textarea
                  id="adMessage" className={`${inputClass} mb-1`} rows={3} maxLength={MAX_AD_MESSAGE}
                  placeholder="Say what you offer or need, in a few words." value={message}
                  onChange={(event) => setMessage(event.target.value)} disabled={sending}
                />
                <div className="d-flex justify-content-between text-secondary fs-8 mb-3">
                  <span>No links. Bad words are hidden automatically.</span>
                  <span>{message.length}/{MAX_AD_MESSAGE}</span>
                </div>

                <span className="form-label text-white fw-semibold fs-7 d-block">Picture (optional):</span>
                <input ref={pictureInputRef} type="file" className="d-none" accept={BILLBOARD_PICTURE_ACCEPT} onChange={handlePick} aria-label="Ad picture" />
                <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                  {previewUrl && <img src={previewUrl} alt="The picture you chose" className="rounded-3" style={{ width: 120, height: 64, objectFit: "cover" }} />}
                  <div className="d-flex flex-column gap-1">
                    <div className="d-flex flex-wrap gap-2">
                      <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => pictureInputRef.current?.click()} disabled={sending}>
                        <i className="bi bi-image me-1"></i> {picture ? "Change picture" : "Choose a picture"}
                      </button>
                      {picture && (
                        <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={clearPicture} disabled={sending}>
                          <i className="bi bi-x-lg me-1"></i> Remove
                        </button>
                      )}
                    </div>
                    <small className="text-secondary fs-8">JPG, PNG or WebP. A wide picture works best.</small>
                  </div>
                </div>

                <span className="form-label text-white fw-semibold fs-7 d-block">Who sees it:</span>
                <div className="d-flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Who sees it">
                  {AD_AUDIENCES.map((item) => (
                    <button
                      key={item.value} type="button" role="radio" aria-checked={audience === item.value}
                      className={pill(audience === item.value)} onClick={() => setAudience(item.value)} disabled={sending}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <label htmlFor="adLink" className="form-label text-white fw-semibold fs-7">Button on your ad (optional):</label>
                <select
                  id="adLink" className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2 mb-1"
                  value={link} onChange={(event) => setLink(event.target.value)} disabled={sending}
                >
                  <option value="">No button</option>
                  {choices.services.length > 0 && (
                    <optgroup label="My offers">
                      {choices.services.map((item) => <option key={item.id} value={`service:${item.id}`}>Open my offer: {item.title}</option>)}
                    </optgroup>
                  )}
                  {choices.jobs.length > 0 && (
                    <optgroup label="My job posts">
                      {choices.jobs.map((item) => <option key={item.id} value={`job:${item.id}`}>Open my job post: {item.title}</option>)}
                    </optgroup>
                  )}
                  <option value="profile">Open my profile</option>
                </select>
                <small className="text-secondary fs-8 d-block mb-3">It can only open your own offer, job post or profile.</small>

                <span className="form-label text-white fw-semibold fs-7 d-block">How long:</span>
                {priceResult === undefined && <p className="text-secondary fs-8">Loading the prices...</p>}
                {priceResult?.error && <p className="text-danger fs-8" role="alert">{priceResult.error}</p>}
                <div className="d-flex flex-wrap gap-2 mb-1" role="radiogroup" aria-label="How long">
                  {prices.map((option) => {
                    const selected = option.code === code;
                    const discounted = isPro && option.pro_price != null;
                    return (
                      <button
                        key={option.code} type="button" role="radio" aria-checked={selected} disabled={sending}
                        className={`btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 d-flex flex-column ${selected ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
                        onClick={() => setCode(option.code)}
                      >
                        <span>{option.days} days</span>
                        <span className="fs-8">
                          {formatPeso(adPrice(option, isPro))}
                          {discounted && <s className="ms-1 opacity-75">{formatPeso(option.price)}</s>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {isPro && <p className="text-success fs-8 mb-4"><i className="bi bi-gem me-1"></i>Premium price.</p>}
                {!isPro && <p className="text-secondary fs-8 mb-4">Premium members pay half.</p>}

                <span className="form-label text-white fw-semibold fs-7 d-block">Preview:</span>
                <div className="rounded-3 overflow-hidden border border-secondary border-opacity-25 bg-black bg-opacity-25 mb-4">
                  <MemberAdSlide
                    small previewOnly
                    ad={{ title: title.trim() || "Your headline", message: message.trim() }}
                    owner={{ name: displayName, verified: true, premium: isPro }}
                    pictureUrl={previewUrl}
                    button={previewButton(link)}
                  />
                </div>

                {formError && <p className="text-danger fs-7 mb-3" role="alert">{formError}</p>}
                <button
                  type="submit" data-tour="advertise-submit"
                  className="btn btn-gradient-role btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow-role"
                  disabled={sending || prices.length === 0}
                >
                  {sending ? "Sending..." : "Submit for review"}
                </button>
                <p className="text-secondary fs-8 mt-2 mb-0">Nothing is charged now. You get a notification when an admin answers, and you pay then.</p>
              </form>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div data-tour="advertise-list" className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-1"><i className="bi bi-grid-fill text-warning me-2"></i> My Ads</h5>
            {spots !== null && (
              <p className="text-white-50 fs-8 mb-3">
                <i className="bi bi-layout-text-window-reverse me-1"></i>{MAX_SPOTS - spots} of {MAX_SPOTS} spots are in use right now.
              </p>
            )}

            {ads === null && !adsError && <p className="text-secondary fs-7 mb-0">Loading...</p>}
            {adsError && <p className="text-danger fs-7 mb-0" role="alert">{adsError}</p>}
            {ads?.length === 0 && <p className="text-secondary fs-7 mb-0">You haven't sent an ad yet.</p>}

            <div className="d-flex flex-column gap-3">
              {ads?.map((ad) => {
                const state = adState(ad);
                const badge = AD_STATES[state];
                const row = prices.find((item) => item.code === ad.price_code);
                const amount = row ? adPrice(row, isPro) : null;
                return (
                  <div key={ad.id} className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
                    <h6 className="mb-2 text-white fw-bold text-break"><CensoredText text={ad.title} /></h6>
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                      <span className={`badge ${badge.className} fs-8`}>{badge.label}</span>
                      <span className="badge bg-secondary fs-8">{audienceLabel(ad.audience)}</span>
                    </div>
                    {state === "pending" && <p className="text-white-50 fs-8 mb-0 mt-1">Sent {formatFeatureDate(ad.created_at)}. You will get a notification.</p>}
                    {state === "approved" && (
                      <p className="text-white-50 fs-8 mb-0 mt-1">
                        An admin approved it. Pay to put it on the board ({ad.days} days).
                        {spots === 0 && " All the spots are taken right now, so try again later."}
                      </p>
                    )}
                    {state === "rejected" && <p className="text-white-50 fs-8 mb-0 mt-1">Reason: {ad.reject_reason}</p>}
                    {state === "running" && <p className="text-white-50 fs-8 mb-0 mt-1">Until {formatFeatureDate(ad.ends_at)} ({ad.days} days).</p>}
                    {state === "ended" && <p className="text-white-50 fs-8 mb-0 mt-1">{formatFeatureDate(ad.starts_at)} to {formatFeatureDate(ad.ends_at)} ({ad.days} days).</p>}
                    {state === "canceled" && <p className="text-white-50 fs-8 mb-0 mt-1">You withdrew it.</p>}
                    {state === "removed" && <p className="text-white-50 fs-8 mb-0 mt-1">Taken down. Reason: {ad.reject_reason}</p>}

                    {(state === "pending" || state === "approved") && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {state === "approved" && withdrawingId !== ad.id && (
                          <button
                            type="button" className="btn btn-sm btn-gradient-role rounded-pill px-3 fw-bold text-white"
                            onClick={() => handlePay(ad)} disabled={payOnline !== true || payingId === ad.id || spots === 0}
                          >
                            {payingId === ad.id ? "Opening Xendit..." : amount !== null ? `Pay ${formatPeso(amount)} now` : "Pay now"}
                          </button>
                        )}
                        {withdrawingId === ad.id ? (
                          <>
                            <button type="button" className="btn btn-sm btn-danger rounded-pill px-3 fw-semibold" onClick={() => handleWithdraw(ad)}>Yes, withdraw</button>
                            <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 fw-semibold" onClick={() => setWithdrawingId(null)}>Keep it</button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 fw-semibold" onClick={() => setWithdrawingId(ad.id)} disabled={payingId === ad.id}>
                            Withdraw
                          </button>
                        )}
                      </div>
                    )}
                    {state === "approved" && payOnline === false && (
                      <p className="text-warning fs-8 mb-0 mt-2">Paying online is not open yet. Please try again later.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
