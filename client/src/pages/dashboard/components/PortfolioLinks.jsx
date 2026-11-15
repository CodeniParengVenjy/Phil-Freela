import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_PORTFOLIO_LINKS, canVerifyLink, cleanPortfolioLink, fetchPortfolioLinks, fetchSiteVerifications, isFreshlyVerified,
  isSafeLink, linkIcon, linkLabel, savePortfolioLinks, verifiedDateText
} from "../../../lib/profile";
import { Loader } from "../../../components/Loaders";
import SiteVerifyDialog from "./SiteVerifyDialog";

// Portfolio links (panel revision, PLAN-panel-revisions.md, item 6): up to 3
// links to a freelancer's work on other sites.
//
// <PortfolioLinksBox>: on the freelancer's own Profile. "+ Add Link" opens a
// box, Enter saves the link right away, the x on a link removes it. Works like
// the Skills box (SkillsBox.jsx): if a save fails, the list goes back.
// A link to their own website also gets a Verify button (Verified owner badge,
// PLAN-site-verification.md), which opens SiteVerifyDialog.
export function PortfolioLinksBox({ userId, showToast }) {
  // undefined while loading, null when they couldn't load, else the list.
  const [links, setLinks] = useState(undefined);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // { [link]: { code, verified_at } }: the freelancer's own website codes.
  const [sites, setSites] = useState({});
  // The link whose Verify pop-up is open, or null.
  const [verifyLink, setVerifyLink] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.all([fetchPortfolioLinks(userId), fetchSiteVerifications(userId)]).then(([result, codes]) => {
      if (!active) return;
      setLinks(result);
      setSites(codes);
    });
    return () => { active = false; };
  }, [userId]);

  const closeVerify = useCallback(() => setVerifyLink(null), []);
  const handleVerified = useCallback((link, verifiedAt) => {
    setSites((before) => ({ ...before, [link]: { ...before[link], verified_at: verifiedAt } }));
  }, []);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const update = async (next) => {
    const before = links;
    setLinks(next);
    setSaving(true);
    const problem = await savePortfolioLinks(userId, next);
    setSaving(false);
    if (problem) {
      setLinks(before);
      showToast(problem);
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (saving) return;
    const { link, error: problem } = cleanPortfolioLink(input);
    if (problem) {
      setError(problem);
      return;
    }
    if (links.some((l) => l.toLowerCase() === link.toLowerCase())) {
      setError("You already added that link.");
      return;
    }
    if (await update([...links, link])) {
      setInput("");
      setError("");
      setAdding(false);
    }
  };

  const close = () => {
    setInput("");
    setError("");
    setAdding(false);
  };

  const full = links?.length >= MAX_PORTFOLIO_LINKS;
  // Own-website links that don't have a badge yet (they get the hint below the list).
  const canStillVerify = links?.some((link) => canVerifyLink(link) && !isFreshlyVerified(sites[link]?.verified_at));

  // The button after an own-website link: Verify, the green Verified badge
  // (click to check again), or Check again once 90 days have passed.
  const verifyButton = (link) => {
    if (!canVerifyLink(link)) return null;
    const verifiedAt = sites[link]?.verified_at;
    if (isFreshlyVerified(verifiedAt)) {
      return (
        <button
          type="button"
          className="badge rounded-pill bg-success text-white border-0 fw-semibold flex-shrink-0"
          title={`Verified owner since ${verifiedDateText(verifiedAt)}. Click to check again.`}
          onClick={() => setVerifyLink(link)}
        >
          <i className="bi bi-patch-check-fill me-1"></i>Verified
        </button>
      );
    }
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-warning rounded-pill py-0 px-2 fs-8 fw-bold flex-shrink-0"
        onClick={() => setVerifyLink(link)}
      >
        {verifiedAt ? "Check again" : "Verify"}
      </button>
    );
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="text-white fw-bold mb-0"><i className="bi bi-link-45deg text-orange me-2"></i> Portfolio Links</h5>
        {links && !full && !adding && (
          <button type="button" className="btn btn-sm btn-outline-warning rounded-pill fs-8 fw-bold" onClick={() => setAdding(true)}>+ Add Link</button>
        )}
      </div>

      {links === undefined && <Loader size="sm" />}
      {links === null && <p className="text-secondary fs-7 mb-0">Couldn't load your links.</p>}
      {links?.length === 0 && !adding && (
        <p className="text-secondary fs-7 mb-0">
          No links yet. Add up to {MAX_PORTFOLIO_LINKS} links to your work on other sites, like Behance, GitHub or Google Drive, or to your own website.
        </p>
      )}

      {links?.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {links.map((link) => (
            <span key={link} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7 d-inline-flex align-items-center gap-2 mw-100">
              <i className={`bi ${linkIcon(link)}`}></i>
              <a href={isSafeLink(link) ? link : undefined} target="_blank" rel="noopener noreferrer nofollow" className="text-light text-decoration-none text-truncate">
                {linkLabel(link)}
              </a>
              {verifyButton(link)}
              <button
                type="button"
                className="btn-close btn-close-white"
                style={{ fontSize: "0.55rem" }}
                aria-label={`Remove ${linkLabel(link)}`}
                disabled={saving}
                onClick={() => update(links.filter((l) => l !== link))}
              ></button>
            </span>
          ))}
        </div>
      )}

      {links && adding && !full && (
        <div className="mt-3">
          <div className="d-flex gap-2">
            <input
              ref={inputRef}
              type="url"
              inputMode="url"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
              placeholder="https://behance.net/yourname"
              aria-label="New portfolio link"
              maxLength={250}
              value={input}
              onChange={(event) => { setInput(event.target.value); setError(""); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
                if (event.key === "Escape") close();
              }}
            />
            <button type="button" className="btn btn-gradient-role rounded-pill px-3 fw-bold text-white flex-shrink-0" onClick={handleAdd} disabled={saving}>Add</button>
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 flex-shrink-0" onClick={close} disabled={saving}>Cancel</button>
          </div>
          {error && <p className="text-warning fs-8 mt-2 mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i>{error}</p>}
        </div>
      )}
      {full && <p className="text-secondary fs-8 mt-2 mb-0">You've added the most links allowed ({MAX_PORTFOLIO_LINKS}).</p>}
      {canStillVerify && (
        <p className="text-secondary fs-8 mt-2 mb-0">
          <i className="bi bi-patch-check me-1"></i>A link to your own website can get a Verified owner badge: click Verify to prove it&apos;s yours.
        </p>
      )}

      {verifyLink && <SiteVerifyDialog key={verifyLink} link={verifyLink} onClose={closeVerify} onVerified={handleVerified} />}
    </div>
  );
}

// <PortfolioLinksList>: on a freelancer's public page. Each link opens in a
// new tab; "nofollow noopener noreferrer" keeps the other site from reaching
// back into PhilFreela's tab. Nothing shows when there are no links.
// verified: { [link]: verified_at } from fetchVerifiedLinks(): those links get
// the green Verified owner badge.
export function PortfolioLinksList({ links, verified = {} }) {
  const safe = (links || []).filter(isSafeLink);
  if (!safe.length) return null;
  const anyVerified = safe.some((link) => verified[link]);
  return (
    <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
      <h5 className="text-white fw-bold mb-3"><i className="bi bi-link-45deg text-orange me-2"></i> Portfolio Links</h5>
      <div className="d-flex flex-wrap gap-2">
        {safe.map((link) => (
          <a
            key={link}
            href={link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7 text-decoration-none d-inline-flex align-items-center gap-2 mw-100"
          >
            <i className={`bi ${linkIcon(link)}`}></i>
            <span className="text-truncate">{linkLabel(link)}</span>
            {verified[link] && (
              <span
                className="badge rounded-pill bg-success text-white fw-semibold flex-shrink-0"
                title={`Verified owner: checked ${verifiedDateText(verified[link])}`}
                aria-label={`Verified owner, checked ${verifiedDateText(verified[link])}`}
              >
                <i className="bi bi-patch-check-fill me-1"></i>Verified owner
              </span>
            )}
            <i className="bi bi-box-arrow-up-right fs-8 opacity-75"></i>
          </a>
        ))}
      </div>
      <p className="text-secondary fs-8 mt-2 mb-0">
        These open other websites. PhilFreela doesn't check what's on them.
        {anyVerified && " A Verified owner badge means the freelancer proved they control that website (checked in the last 90 days)."}
      </p>
    </div>
  );
}
