import { useEffect, useRef, useState } from "react";
import {
  SOCIAL_PLATFORMS, cleanSocialAccount, fetchSocialLinks, isSafeSocialLink, linkLabel, saveSocialLinks, socialHandle, socialName, socialTitle
} from "../../../lib/profile";
import { Loader } from "../../../components/Loaders";
import "./social-accounts.css";

// Social accounts (PLAN-social-accounts.md): a person's Facebook, Instagram, TikTok, YouTube, LinkedIn, X,
// Threads and Pinterest pages, for freelancers and clients. The look is in social-accounts.css.
//
// <SocialAccountsBox>: on your own Profile. "+ Add account" opens a row: pick the platform, type your @username
// or paste your link, press Enter. Each platform can be added once; the x on an account removes it. It works like
// the Portfolio Links box (PortfolioLinks.jsx): if a save fails, the list goes back.
// inSettings: the same box inside Settings > Profile Settings (the user, 2026-11-20: "this must be settable in
// settings"). It looks like the other settings there (a small label instead of the big heading) and says "saved"
// after each change, because it saves right away, like the picture and the "Available for work" switch.
// onChange(accounts): called with { platform: link } once loaded and after every saved change, so the Profile
// page can show the same accounts in its header.
export function SocialAccountsBox({ userId, showToast, inSettings = false, onChange }) {
  // undefined while loading, null when they couldn't load, else { platform: link }.
  const [accounts, setAccounts] = useState(undefined);
  const [adding, setAdding] = useState(false);
  // The platform picked in the add row, and what was typed.
  const [platform, setPlatform] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  // (kept in a ref so a new function from the page never restarts the loading below)
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchSocialLinks(userId).then((result) => {
      if (!active) return;
      setAccounts(result);
      onChangeRef.current?.(result || {});
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  // The platforms not added yet (the dropdown only offers these), and the one picked now.
  const left = accounts ? SOCIAL_PLATFORMS.filter((p) => !accounts[p.key]) : [];
  const chosen = left.find((p) => p.key === platform) ?? left[0];
  const added = accounts ? SOCIAL_PLATFORMS.filter((p) => accounts[p.key]) : [];
  // Saved links with no name inside them (Facebook's profile.php?id=... or /share/..., a YouTube channel number...):
  // their chip can only say the platform, so the box explains how to get a name on it.
  const nameless = added.filter((p) => !socialName(p.key, accounts[p.key]));

  const update = async (next) => {
    const before = accounts;
    setAccounts(next);
    setSaving(true);
    const problem = await saveSocialLinks(userId, next);
    setSaving(false);
    if (problem) {
      setAccounts(before);
      showToast(problem);
      return false;
    }
    onChangeRef.current?.(next);
    if (inSettings) showToast("Social accounts saved.");
    return true;
  };

  const handleAdd = async () => {
    if (saving || !chosen) return;
    const { link, error: problem } = cleanSocialAccount(chosen.key, input);
    if (problem) {
      setError(problem);
      return;
    }
    if (await update({ ...accounts, [chosen.key]: link })) {
      setInput("");
      setError("");
      setAdding(false);
    }
  };

  const remove = (key) => update(Object.fromEntries(Object.entries(accounts).filter(([name]) => name !== key)));

  const close = () => {
    setInput("");
    setError("");
    setAdding(false);
  };

  return (
    <div data-testid="social-accounts-box">
      <div className="d-flex justify-content-between align-items-center mb-2">
        {inSettings
          ? <span className="text-white-50 fw-semibold fs-7">Social Accounts:</span>
          : <h5 className="text-white fw-bold mb-0"><i className="bi bi-share-fill text-orange me-2"></i> Social Accounts</h5>}
        {accounts && left.length > 0 && !adding && (
          <button type="button" className="btn btn-sm btn-outline-warning rounded-pill fs-8 fw-bold" onClick={() => setAdding(true)}>+ Add account</button>
        )}
      </div>

      {accounts === undefined && <Loader size="sm" />}
      {accounts === null && <p className="text-secondary fs-7 mb-0">Couldn't load your accounts.</p>}
      {accounts && added.length === 0 && !adding && (
        <p className="text-secondary fs-7 mb-0">
          No accounts yet. Add your Facebook, Instagram, TikTok, YouTube, LinkedIn, X and more, so people can find you there.
        </p>
      )}

      {added.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {added.map((p) => (
            <span key={p.key} className="badge bg-secondary bg-opacity-75 text-light ps-1 pe-2 py-1 rounded-pill fs-7 d-inline-flex align-items-center gap-2 mw-100">
              <span className={`social-ic sp-${p.key}`}><i className={`bi ${p.icon}`}></i></span>
              <a
                href={isSafeSocialLink(p.key, accounts[p.key]) ? accounts[p.key] : undefined}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={`${p.label}: ${linkLabel(accounts[p.key])}`}
                className="text-light text-decoration-none text-truncate"
              >
                {socialHandle(p.key, accounts[p.key])}
              </a>
              <button
                type="button"
                className="btn-close btn-close-white"
                style={{ fontSize: "0.55rem" }}
                aria-label={`Remove ${p.label}`}
                disabled={saving}
                onClick={() => remove(p.key)}
              ></button>
            </span>
          ))}
        </div>
      )}

      {nameless.length > 0 && (
        <p className="text-secondary fs-8 mt-2 mb-0">
          <i className="bi bi-info-circle me-1"></i>
          {nameless.length === 1
            ? `Your ${nameless[0].label} link has no name in it, so its chip just says "${nameless[0].label}". To show your name, remove it and add it again by typing your username instead of pasting the link.`
            : `The ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(nameless.map((p) => p.label))} links have no name in them, so those chips just say the platform. To show a name, remove them and add them again by typing your username instead of pasting the link.`}
        </p>
      )}

      {accounts && adding && chosen && (
        <div className="mt-3">
          <div className="d-flex flex-wrap gap-2">
            {/* (the dark dropdown style comes from "form-select ... text-white", see index.css) */}
            <select
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2 w-auto"
              aria-label="Platform"
              value={chosen.key}
              disabled={saving}
              onChange={(event) => { setPlatform(event.target.value); setError(""); }}
            >
              {left.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 flex-grow-1 w-auto"
              style={{ minWidth: "12rem" }}
              placeholder={`@username or ${chosen.label} link`}
              aria-label={`${chosen.label} username or link`}
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
      {accounts && left.length === 0 && <p className="text-secondary fs-8 mt-2 mb-0">You've added every platform there is room for.</p>}
      {inSettings && (
        <small className="d-block text-secondary fs-8 mt-2">Saved as soon as you add or remove one. Everyone who views your profile can see these.</small>
      )}
    </div>
  );
}

// <SocialAccountsRow>: under a person's name, on their public page and on your own Profile (centered there).
// "FIND BEA ON", then one round logo button per account: it opens the page in a new tab ("nofollow noopener
// noreferrer" keeps the other site from reaching back into PhilFreela's tab) and shows "@bea.edits on TikTok"
// as its tooltip. Only a link that fits its platform is drawn (isSafeSocialLink), whatever is stored. Nothing
// shows when there are no accounts. links: { platform: link }.
export function SocialAccountsRow({ links, name, centered = false }) {
  const shown = SOCIAL_PLATFORMS.filter((p) => isSafeSocialLink(p.key, links?.[p.key]));
  if (!shown.length) return null;
  const first = (name || "").trim().split(/\s+/)[0] || "me";
  return (
    <div className={`social-row ${centered ? "justify-content-center mb-3" : "mt-3"}`} role="group" aria-label={`${first}'s social accounts`} data-testid="social-accounts-row">
      <span className="social-label text-secondary">Find {first} on</span>
      {shown.map((p) => (
        <a
          key={p.key}
          href={links[p.key]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`social-btn sp-${p.key}`}
          title={socialTitle(p.key, links[p.key], first)}
          aria-label={`${first}'s ${p.label} (opens in a new tab)`}
        >
          <i className={`bi ${p.icon}`}></i>
        </a>
      ))}
      <span className="text-secondary fs-8 w-100">These open other websites. PhilFreela doesn&apos;t check what&apos;s on them.</span>
    </div>
  );
}
