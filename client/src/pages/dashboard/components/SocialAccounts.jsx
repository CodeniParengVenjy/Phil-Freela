import { useEffect, useRef, useState } from "react";
import {
  MAX_SOCIAL_LABEL_LENGTH, SOCIAL_PLATFORMS, cleanSocialAccount, cleanSocialLabel, fetchSocialLabels, fetchSocialLinks, isSafeSocialLink,
  linkLabel, saveSocialLinks, socialHandle, socialName, socialTitle, safeSocialLabel
} from "../../../lib/profile";
import { fetchSocialName } from "../../../lib/aiService";
import { Loader } from "../../../components/Loaders";
import "./social-accounts.css";

// Social accounts (PLAN-social-accounts.md): a person's Facebook, Instagram, TikTok, YouTube, LinkedIn, GitHub, X
// and Threads pages, for freelancers and clients (Pinterest was removed 2026-11-24). The look is in social-accounts.css.
//
// <SocialAccountsBox>: on your own Profile. "+ Add account" opens a row: pick the platform, type your @username
// or paste your link, optionally a "Name to show", press Enter. Each platform can be added once; the pencil on an
// account changes its name, the x removes it. It works like the Portfolio Links box (PortfolioLinks.jsx): if a save
// fails, the list goes back. The name is for links that have none inside them (a Facebook profile.php?id= link).
// Name from the page (PLAN-social-name.md, the user, 2026-11-24: "by pasting link, I want that automatically getting
// the name"): right after a paste (or a moment after typing a username) the AI service opens the page once and reads
// the name on it ("Juan Dela Cruz"), and it goes into "Name to show". It never replaces a name typed by hand, and when
// the page shows no name (a login page, a missing account) the box just stays empty.
// inSettings: the same box inside Settings > Profile Settings (the user, 2026-11-20: "this must be settable in
// settings"). It looks like the other settings there (a small label instead of the big heading) and says "saved"
// after each change, because it saves right away, like the picture and the "Available for work" switch.
// onChange(accounts, labels): called with { platform: link } and { platform: name } once loaded and after every
// saved change, so the Profile page can show the same accounts in its header.
export function SocialAccountsBox({ userId, showToast, inSettings = false, onChange }) {
  // undefined while loading, null when they couldn't load, else { platform: link }.
  const [accounts, setAccounts] = useState(undefined);
  // The names they typed, { platform: name } ({} when none, or when they couldn't be loaded).
  const [labels, setLabels] = useState({});
  const [adding, setAdding] = useState(false);
  // The platform picked in the add row, what was typed for it, and the name to show.
  const [platform, setPlatform] = useState("");
  const [input, setInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  // The platform whose name is being changed (the pencil), and the new text.
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState("");
  // A friendly line under the add row (a name typed in the link box was moved to "Name to show").
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const editRef = useRef(null);
  // (kept in a ref so a new function from the page never restarts the loading below)
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Name from the page: "" (nothing to say), "loading", "filled" (the box now holds the page's name) or "none"
  // (the page showed no name).
  const [nameState, setNameState] = useState("");
  const nameJob = useRef(null); // the last name asked for: { key, link, promise }
  const nameTimer = useRef(null); // the short wait after typing
  const autoName = useRef(""); // the name the page gave, so a new link may replace it (a typed name, never)
  const pasted = useRef(false); // the next change of the link box is a paste
  const nameInputRef = useRef(""); // what is in "Name to show" right now, for the answers that come later
  useEffect(() => { nameInputRef.current = nameInput; }, [nameInput]);
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
  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  // The platforms not added yet (the dropdown only offers these), and the one picked now.
  const left = accounts ? SOCIAL_PLATFORMS.filter((p) => !accounts[p.key]) : [];
  const chosen = left.find((p) => p.key === platform) ?? left[0];
  const added = accounts ? SOCIAL_PLATFORMS.filter((p) => accounts[p.key]) : [];
  // Saved links with no name anywhere (none typed, none inside the link: Facebook's profile.php?id=... or /share/...,
  // a YouTube channel number...): their chip can only say the platform, so the box explains the pencil.
  const nameless = added.filter((p) => !safeSocialLabel(labels[p.key]) && !socialName(p.key, accounts[p.key]));

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

  // Forgets the name asked for (the add row closed, or the account was added).
  const resetName = () => {
    clearTimeout(nameTimer.current);
    nameJob.current = null;
    autoName.current = "";
    setNameState("");
  };

  // Asks the AI service for the name on the page of what was typed for this platform: right away after a paste,
  // 0.8 seconds after the last key otherwise (so it isn't asked for every letter of a username).
  const askForName = (key, text, rightAway) => {
    clearTimeout(nameTimer.current);
    const { link } = cleanSocialAccount(key, text);
    const job = nameJob.current;
    // Already asked for this link: don't ask again. A paste of the same link after "no name" does ask again (the
    // service may have been waking up, or the page may answer this time).
    if (link && job && job.key === key && job.link === link && !(rightAway && job.done && !job.name)) return;
    // Another link (or none): a name the page gave for the old link doesn't fit any more.
    const current = nameInputRef.current;
    const typedByHand = current.trim() !== "" && current !== autoName.current;
    if (!typedByHand && current) {
      nameInputRef.current = "";
      setNameInput("");
    }
    nameJob.current = null;
    autoName.current = "";
    setNameState("");
    if (!link || typedByHand) return;
    const start = () => {
      const mine = { key, link };
      mine.promise = fetchSocialName(key, link).then((name) => cleanSocialLabel(name).label || "");
      nameJob.current = mine;
      setNameState("loading");
      mine.promise.then((name) => {
        mine.done = true;
        mine.name = name;
        if (nameJob.current !== mine) return; // the link changed while the page was read
        const now = nameInputRef.current;
        if (name && (now.trim() === "" || now === autoName.current)) {
          autoName.current = name;
          nameInputRef.current = name;
          setNameInput(name);
          setNameState("filled");
        } else {
          setNameState(name ? "" : "none");
        }
      });
    };
    if (rightAway) start();
    else nameTimer.current = setTimeout(start, 800);
  };

  const handleAdd = async () => {
    if (saving || !chosen) return;
    clearTimeout(nameTimer.current);
    // A name typed in the link box ("VG Cuevas"; the user, 2026-11-24: "if I will put name or link"): a name can't
    // open a page (links use the username or a number), so it goes into "Name to show" and the box asks for the
    // link or @username instead of showing an error.
    const typed = input.trim();
    if (/\s/.test(typed) && !typed.includes("/")) {
      const { label, error: labelProblem } = cleanSocialLabel(typed.replace(/^@/, ""));
      if (labelProblem) {
        setError(labelProblem);
        return;
      }
      const nameBoxFree = !nameInput.trim() || nameInput === autoName.current;
      if (nameBoxFree) {
        resetName();
        nameInputRef.current = label;
        setNameInput(label);
        setInput("");
      }
      setError("");
      setNotice(nameBoxFree
        ? `"${label}" is a name, so it's in "Name to show" now. Paste your ${chosen.label} link here (or type your @username), then press Add.`
        : `That's a name. Put your ${chosen.label} link or @username here; the name goes in "Name to show".`);
      inputRef.current?.focus();
      return;
    }
    const { link, error: problem } = cleanSocialAccount(chosen.key, input);
    if (problem) {
      setError(problem);
      return;
    }
    // Add was pressed while the name is still being read from this page: wait for it (12 seconds at most, then the
    // account is added without it).
    let typedName = nameInput;
    const job = nameJob.current;
    if (job && job.key === chosen.key && job.link === link && nameState === "loading" && (!typedName.trim() || typedName === autoName.current)) {
      setSaving(true);
      await Promise.race([job.promise, new Promise((done) => setTimeout(done, 12000))]);
      setSaving(false);
      if (nameJob.current !== job) return; // closed with Escape while waiting
      typedName = nameInputRef.current;
    }
    const { label, error: labelProblem } = cleanSocialLabel(typedName);
    if (labelProblem) {
      setError(labelProblem);
      return;
    }
    if (await update({ ...accounts, [chosen.key]: link }, label ? { ...labels, [chosen.key]: label } : labels)) {
      setInput("");
      setNameInput("");
      setError("");
      setNotice("");
      setAdding(false);
      resetName();
    }
  };

  // Removing an account takes its name with it.
  const remove = (key) => update(without(accounts, key), without(labels, key));

  const startEdit = (key) => {
    setAdding(false);
    setError("");
    setEditing(key);
    setEditText(safeSocialLabel(labels[key]));
  };

  const closeEdit = () => {
    setEditing(null);
    setEditText("");
    setError("");
  };

  // An empty name takes the typed name away (the chip goes back to the name inside the link, or the platform).
  const handleSaveName = async () => {
    if (saving || !editing) return;
    const { label, error: problem } = cleanSocialLabel(editText);
    if (problem) {
      setError(problem);
      return;
    }
    if (await update(accounts, label ? { ...labels, [editing]: label } : without(labels, editing))) closeEdit();
  };

  const close = () => {
    setInput("");
    setNameInput("");
    setError("");
    setNotice("");
    setAdding(false);
    resetName();
  };

  const editingPlatform = editing ? SOCIAL_PLATFORMS.find((p) => p.key === editing) : null;

  return (
    <div data-testid="social-accounts-box">
      <div className="d-flex justify-content-between align-items-center mb-2">
        {inSettings
          ? <span className="text-white-50 fw-semibold fs-7">Social Accounts:</span>
          : <h5 className="text-white fw-bold mb-0"><i className="bi bi-share-fill text-orange me-2"></i> Social Accounts</h5>}
        {accounts && left.length > 0 && !adding && !editing && (
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
                {socialHandle(p.key, accounts[p.key], labels[p.key])}
              </a>
              <button
                type="button"
                className="btn btn-link text-white-50 p-0 lh-1 border-0"
                aria-label={`Change the name of ${p.label}`}
                title="Change the name"
                disabled={saving}
                onClick={() => startEdit(p.key)}
              >
                <i className="bi bi-pencil-fill fs-8"></i>
              </button>
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
            ? `Your ${nameless[0].label} link has no name in it, so its chip just says "${nameless[0].label}". Tap the pencil on the chip to type the name to show.`
            : `The ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(nameless.map((p) => p.label))} links have no name in them, so those chips just say the platform. Tap the pencil on a chip to type the name to show.`}
        </p>
      )}

      {editingPlatform && (
        <div className="mt-3">
          <div className="d-flex flex-wrap gap-2">
            <input
              ref={editRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 flex-grow-1 w-auto"
              style={{ minWidth: "12rem" }}
              placeholder={`Name to show for ${editingPlatform.label}`}
              aria-label={`Name to show for ${editingPlatform.label}`}
              maxLength={MAX_SOCIAL_LABEL_LENGTH + 10}
              value={editText}
              onChange={(event) => { setEditText(event.target.value); setError(""); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveName();
                }
                if (event.key === "Escape") closeEdit();
              }}
            />
            <button type="button" className="btn btn-gradient-role rounded-pill px-3 fw-bold text-white flex-shrink-0" onClick={handleSaveName} disabled={saving}>Save name</button>
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 flex-shrink-0" onClick={closeEdit} disabled={saving}>Cancel</button>
          </div>
          <p className="text-secondary fs-8 mt-1 mb-0">Up to {MAX_SOCIAL_LABEL_LENGTH} characters, no links. Leave it empty to go back to the name in the link.</p>
          {error && <p className="text-warning fs-8 mt-2 mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i>{error}</p>}
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
              placeholder={`@username or ${chosen.label} link`}
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
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 w-auto"
              style={{ width: "12rem" }}
              placeholder={nameState === "loading" ? "Getting the name…" : "Name to show (optional)"}
              aria-label={`Name to show for ${chosen.label} (optional)`}
              maxLength={MAX_SOCIAL_LABEL_LENGTH + 10}
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value);
                setError("");
                if (nameState !== "loading") setNameState("");
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
          {/* Name from the page: what is happening with "Name to show" */}
          <div data-testid="social-name-status">
            {nameState === "loading" && <Loader size="sm" label={`Getting the name from the ${chosen.label} page`} className="mt-2 fs-8" />}
            {nameState === "filled" && (
              <p className="text-secondary fs-8 mt-2 mb-0">
                <i className="bi bi-stars text-orange me-1"></i>Name filled from the {chosen.label} page. Change it if it&apos;s wrong.
              </p>
            )}
            {nameState === "none" && !socialName(chosen.key, cleanSocialAccount(chosen.key, input).link) && (
              <p className="text-secondary fs-8 mt-2 mb-0">
                <i className="bi bi-info-circle me-1"></i>Couldn&apos;t get the name from the {chosen.label} page. You can type it in &quot;Name to show&quot;.
              </p>
            )}
          </div>
          {notice && <p className="text-info fs-8 mt-2 mb-0" data-testid="social-notice"><i className="bi bi-info-circle me-1"></i>{notice}</p>}
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
