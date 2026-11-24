import { useEffect, useRef, useState } from "react";
import {
  SOCIAL_PLATFORMS, cleanSocialAccount, cleanSocialLabel, fetchSocialLabels, fetchSocialLinks, isSafeSocialLink,
  linkLabel, saveSocialLinks, socialHandle, socialTitle
} from "../../../lib/profile";
import { checkSocialAccount } from "../../../lib/aiService";
import { Loader } from "../../../components/Loaders";
import "./social-accounts.css";

// Social accounts (PLAN-social-accounts.md): a person's Facebook, Instagram, TikTok, YouTube, LinkedIn, GitHub, X
// and Threads pages, for freelancers and clients (Pinterest was removed 2026-11-24). The look is in social-accounts.css.
//
// <SocialAccountsBox>: on your own Profile. "+ Add account" opens a row: pick the platform, paste your link (or type
// your @username), press Enter or Add. Each platform can be added once; the x removes an account. It works like the
// Portfolio Links box (PortfolioLinks.jsx): if a save fails, the list goes back.
// Name from the page (PLAN-social-name.md): right after a paste (or a moment after typing a username) the AI service
// opens the page once and reads the name on it ("Juan Dela Cruz"); the name is saved with the link and shown on the
// account. When the page shows no name (a login page, an account Facebook hides from servers), the account just shows
// its link. There is no "Name to show" box (the user, 2026-11-24: "if website cant appear the name, just link only
// instead.... remove the Name to Show... as well other platforms").
// Checks (2026-11-24, the user: "okay build it, also build the not correct link like that"): a link to a post, video
// or group is refused, or shortened to the account in it (cleanSocialAccount in profile.js); an account that YouTube,
// GitHub or X says doesn't exist can't be added ("block Add", the user's choice).
// inSettings: the same box inside Settings > Profile Settings (the user, 2026-11-20: "this must be settable in
// settings"). It looks like the other settings there (a small label instead of the big heading) and says "saved"
// after each change, because it saves right away, like the picture and the "Available for work" switch.
// onChange(accounts, labels): called with { platform: link } and { platform: name } once loaded and after every
// saved change, so the Profile page can show the same accounts in its header.
export function SocialAccountsBox({ userId, showToast, inSettings = false, onChange }) {
  // undefined while loading, null when they couldn't load, else { platform: link }.
  const [accounts, setAccounts] = useState(undefined);
  // The names found on the pages (or typed before 2026-11-24), { platform: name } ({} when none, or not loaded).
  const [labels, setLabels] = useState({});
  const [adding, setAdding] = useState(false);
  // The platform picked in the add row, and what was typed for it.
  const [platform, setPlatform] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  // A friendly line under the add row (a name was typed where the link goes).
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  // (kept in a ref so a new function from the page never restarts the loading below)
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Name from the page: "" (nothing yet), "loading", "found" (foundName holds it), "none" (only the link will show)
  // or "missing" (the platform says there is no such account: it can't be added).
  const [nameState, setNameState] = useState("");
  const [foundName, setFoundName] = useState("");
  const nameJob = useRef(null); // the last page asked about: { key, link, promise, done, name, missing }
  const nameTimer = useRef(null); // the short wait after typing
  const pasted = useRef(false); // the next change of the link box is a paste
  useEffect(() => () => clearTimeout(nameTimer.current), []);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.all([fetchSocialLinks(userId), fetchSocialLabels(userId)]).then(([links, names]) => {
      if (!active) return;
      setAccounts(links);
      setLabels(names);
      onChangeRef.current?.(links || {}, names);
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
  // What the pasted link really is, checked as it is typed: shortened to the account in it ("tiktok.com/@juan" from a
  // video link), or not an account at all (a post, a group, the platform's own page). Only for links (with a "/"),
  // so a username being typed never shows a warning.
  const typedLink = adding && chosen && input.trim().includes("/") ? cleanSocialAccount(chosen.key, input) : null;
  const shortenedTo = typedLink?.fixed ? typedLink.link : "";
  const wrongLink = typedLink?.wrongPage ? typedLink.error : "";

  // What an account says: the name from its page (or one typed before), the name inside the link ("@bea.edits"),
  // or else just the platform's name ("Facebook"); the link itself shows on hover. (The user, 2026-11-24, on a chip
  // that showed "web.facebook.com/profile.php?id=…": "what is this??", then chose "Just Facebook".)
  const accountText = (key, link) => socialHandle(key, link, labels[key]);

  // Saves the links and the names together; if it fails, both go back.
  const update = async (nextLinks, nextLabels = labels) => {
    const before = { links: accounts, names: labels };
    setAccounts(nextLinks);
    setLabels(nextLabels);
    setSaving(true);
    const problem = await saveSocialLinks(userId, nextLinks, nextLabels);
    setSaving(false);
    if (problem) {
      setAccounts(before.links);
      setLabels(before.names);
      showToast(problem);
      return false;
    }
    onChangeRef.current?.(nextLinks, nextLabels);
    if (inSettings) showToast("Social accounts saved.");
    return true;
  };

  const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

  // Forgets the name asked for (the link changed, the row closed, or the account was added).
  const resetName = () => {
    clearTimeout(nameTimer.current);
    nameJob.current = null;
    setFoundName("");
    setNameState("");
  };

  // Asks the AI service for the name on the page of what was typed for this platform: right away after a paste,
  // 0.8 seconds after the last key otherwise (so it isn't asked for every letter of a username).
  const askForName = (key, text, rightAway) => {
    const { link } = cleanSocialAccount(key, text);
    const job = nameJob.current;
    // Already asked for this link: don't ask again. A paste of the same link after "no name" does ask again (the
    // service may have been waking up, or the page may answer this time).
    if (link && job && job.key === key && job.link === link && !(rightAway && job.done && !job.name)) return;
    resetName();
    if (!link) return;
    const start = () => {
      const mine = { key, link };
      mine.promise = checkSocialAccount(key, link).then(({ name, missing }) => ({ name: cleanSocialLabel(name).label || "", missing }));
      nameJob.current = mine;
      setNameState("loading");
      mine.promise.then(({ name, missing }) => {
        mine.done = true;
        mine.name = name;
        mine.missing = missing;
        if (nameJob.current !== mine) return; // the link changed while the page was read
        setFoundName(name);
        setNameState(missing ? "missing" : name ? "found" : "none");
      });
    };
    if (rightAway) start();
    else nameTimer.current = setTimeout(start, 800);
  };

  const handleAdd = async () => {
    if (saving || !chosen) return;
    clearTimeout(nameTimer.current);
    // A name typed where the link goes ("VG Cuevas"): a name can't open a page (links use the username or a number),
    // so the box says what to paste instead of a "can't have spaces" warning.
    const typed = input.trim();
    if (/\s/.test(typed) && !typed.includes("/")) {
      setError("");
      setNotice(`"${typed.replace(/^@/, "")}" is a name, and a name can't open a ${chosen.label} page. Paste your ${chosen.label} link here (open your profile and copy its address), or type your @username.`);
      inputRef.current?.focus();
      inputRef.current?.select(); // so a paste replaces it
      return;
    }
    const { link, error: problem } = cleanSocialAccount(chosen.key, input);
    if (problem) {
      setError(problem);
      return;
    }
    // The name on the page. Not asked yet (Add right after typing): ask now. Still coming: wait for it, 12 seconds
    // at most, then the account is added with its link only.
    let job = nameJob.current;
    if (!job || job.key !== chosen.key || job.link !== link) {
      askForName(chosen.key, link, true);
      job = nameJob.current;
    }
    if (job && !job.done) {
      setSaving(true);
      await Promise.race([job.promise, new Promise((done) => setTimeout(done, 12000))]);
      setSaving(false);
      if (nameJob.current !== job) return; // closed with Escape while waiting
    }
    // The platform says there is no such account: not added (the line under the row says why).
    if (job?.done && job.missing) {
      inputRef.current?.focus();
      return;
    }
    const name = job?.done ? job.name : "";
    if (await update({ ...accounts, [chosen.key]: link }, name ? { ...labels, [chosen.key]: name } : without(labels, chosen.key))) {
      setInput("");
      setError("");
      setNotice("");
      setAdding(false);
      resetName();
    }
  };

  // Removing an account takes its name with it.
  const remove = (key) => update(without(accounts, key), without(labels, key));

  const close = () => {
    setInput("");
    setError("");
    setNotice("");
    setAdding(false);
    resetName();
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
          No accounts yet. Add your Facebook, Instagram, TikTok, YouTube, LinkedIn, GitHub, X and more, so people can find you there.
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
                {accountText(p.key, accounts[p.key])}
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

      {accounts && adding && chosen && (
        <div className="mt-3">
          <div className="d-flex flex-wrap gap-2">
            {/* (the dark dropdown style comes from "form-select ... text-white", see index.css) */}
            <select
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2 w-auto"
              aria-label="Platform"
              value={chosen.key}
              disabled={saving}
              onChange={(event) => { setPlatform(event.target.value); setError(""); setNotice(""); askForName(event.target.value, input, true); }}
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
              placeholder={`Paste your ${chosen.label} link or type @username`}
              aria-label={`${chosen.label} username or link`}
              maxLength={250}
              value={input}
              onPaste={(event) => {
                pasted.current = true;
                // Pasting the very same link changes nothing, so onChange doesn't run: ask from here then (a paste of
                // the same link after "no name" tries again).
                const box = event.currentTarget;
                const key = chosen.key;
                setTimeout(() => {
                  if (!pasted.current) return; // onChange already asked
                  pasted.current = false;
                  askForName(key, box.value, true);
                }, 0);
              }}
              onChange={(event) => {
                setInput(event.target.value);
                setError("");
                setNotice("");
                askForName(chosen.key, event.target.value, pasted.current);
                pasted.current = false;
              }}
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
          {/* A link to a post or video inside an account: only the account is added. */}
          {shortenedTo && (
            <p className="text-info fs-8 mt-2 mb-0" data-testid="social-shortened">
              <i className="bi bi-scissors me-1"></i>Only the account part of that link will be added: <span className="text-white fw-semibold">{linkLabel(shortenedTo)}</span>
            </p>
          )}
          {/* Name from the page: shown while it is read, and once found. No name found: nothing to say, the link shows.
              No such account: it can't be added. */}
          <div data-testid="social-name-status">
            {nameState === "loading" && <Loader size="sm" label={`Checking the ${chosen.label} page`} className="mt-2 fs-8" />}
            {nameState === "found" && (
              <p className="text-secondary fs-8 mt-2 mb-0">
                <i className="bi bi-stars text-orange me-1"></i>It will show as <span className="text-white fw-semibold">{foundName}</span>, the name on the {chosen.label} page.
              </p>
            )}
            {nameState === "missing" && (
              <p className="text-warning fs-8 mt-2 mb-0" data-testid="social-missing">
                <i className="bi bi-person-x-fill me-1"></i>We couldn&apos;t find this account on {chosen.label}. Check the link or the username.
              </p>
            )}
          </div>
          {notice && <p className="text-info fs-8 mt-2 mb-0" data-testid="social-notice"><i className="bi bi-info-circle me-1"></i>{notice}</p>}
          {(error || wrongLink) && <p className="text-warning fs-8 mt-2 mb-0" data-testid="social-error"><i className="bi bi-exclamation-triangle-fill me-1"></i>{error || wrongLink}</p>}
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
// (or "Juan Dela Cruz on Facebook") as its tooltip. Only a link that fits its platform is drawn (isSafeSocialLink),
// whatever is stored. Nothing shows when there are no accounts. links: { platform: link }, labels: { platform: name }.
export function SocialAccountsRow({ links, labels, name, centered = false }) {
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
          title={socialTitle(p.key, links[p.key], first, labels?.[p.key])}
          aria-label={`${first}'s ${p.label} (opens in a new tab)`}
        >
          <i className={`bi ${p.icon}`}></i>
        </a>
      ))}
      <span className="text-secondary fs-8 w-100">These open other websites. PhilFreela doesn&apos;t check what&apos;s on them.</span>
    </div>
  );
}
