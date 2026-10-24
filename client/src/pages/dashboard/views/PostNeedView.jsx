import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { matchSkill, suggestSkills } from "../../../lib/aiService";
import { categories, getCategory } from "../../../lib/categories";
import { isPostingBlocked } from "../../../lib/suspensions";
import { formatDay, todayInManila } from "../../../lib/projects";
import { BUDGET_TYPES, JOB_STATES, JOB_TYPES, MAX_FREELANCERS_NEEDED, budgetText, datesText, getJobType, hiredCount, jobState } from "../../../lib/jobTerms";
import BlockedNotice from "../components/BlockedNotice";
import DeletePostDialog from "../components/DeletePostDialog";
import CensoredText from "../../../components/CensoredText";

// The database allows up to 10 skills, each up to 40 characters.
const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 40;

// description and skills are here so the Edit form can be filled in from the list.
// hired:projects(count) is how many freelancers were hired from the post (the
// owner can read their own projects), for the Open / Filled badge.
const JOB_COLUMNS =
  "id, title, category, description, skills, budget, budget_type, job_type, freelancers_needed, start_date, due_date, created_at, updated_at, hired:projects(count)";

// The sentence for a save the database refused. 23514 = a table rule was broken;
// the message names which one.
function saveErrorText(error, editing) {
  const text = error.message || "";
  if (error.code === "23514") {
    if (text.includes("job_posts_start_date_check")) return "The start date can't be before the day you posted this job.";
    if (text.includes("job_posts_dates_order_check")) return "The due date can't be before the start date.";
    if (text.includes("job_posts_due_date_check")) return "The due date can't be in the past.";
    if (text.includes("job_posts_freelancers_needed_check")) return `Freelancers needed must be from 1 to ${MAX_FREELANCERS_NEEDED}.`;
  }
  return editing ? "Couldn't save your changes. Please try again." : "Couldn't publish that listing. Please try again.";
}

export default function PostNeedView() {
  const { currentUserId, showToast, suspension } = useOutletContext();
  // Suspended for a posting violation (e.g. spam): the form is replaced by a notice.
  const postingBlocked = isPostingBlocked(suspension);
  // What is being posted: "project" or "job" ("" = not chosen yet, chosen first).
  const [jobType, setJobType] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  // Required skills, shown as chips on the job page (e.g. "Video Editing").
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  // The AI's skill ideas for what's written so far (tap one to add it), and
  // whether it is working ("loading") or couldn't be reached ("offline").
  const [suggestions, setSuggestions] = useState([]);
  const [suggestState, setSuggestState] = useState("idle");
  const [budget, setBudget] = useState("");
  // What the budget counts: "project", "day" or "month". It follows the type
  // until the client picks one themselves.
  const [budgetType, setBudgetType] = useState("project");
  const [budgetTypeChosen, setBudgetTypeChosen] = useState(false);
  // The days the work starts and is due, as "YYYY-MM-DD". Both are required.
  // When the due date passes, the post stops showing to freelancers.
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  // How many freelancers the client wants to hire (a number box, so text).
  // When that many are hired, the post stops showing.
  const [freelancersNeeded, setFreelancersNeeded] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState(null);
  // The job waiting in the "Delete this job post?" pop-up (null = closed).
  const [postToDelete, setPostToDelete] = useState(null);

  // Edit mode: /dashboard/post-need?edit=<job id> (the pencil buttons link
  // here). The form is filled in from that job and "Save changes" updates it
  // instead of posting a new one. Only your own jobs are in the list, so
  // someone else's id finds nothing and the form stays the normal one.
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const editing = (editId && posts?.find((p) => p.id === editId)) || null;
  const editingState = editing ? jobState(editing, hiredCount(editing)) : null;
  const formTop = useRef(null);
  const typeTop = useRef(null);
  // Which job the form was last filled in from.
  const [filledFromId, setFilledFromId] = useState(null);
  if (editing && filledFromId !== editing.id) {
    // Filled in while rendering (React allows this for state of this same
    // component), so the form never shows the old text for a moment.
    setFilledFromId(editing.id);
    setJobType(editing.job_type);
    setTitle(editing.title);
    setCategory(editing.category);
    setDescription(editing.description);
    setSkills(editing.skills || []);
    setSkillInput("");
    setBudget(editing.budget ? String(editing.budget) : "");
    setBudgetType(editing.budget_type);
    setBudgetTypeChosen(true);
    setStartDate(editing.start_date || "");
    setDueDate(editing.due_date || "");
    setFreelancersNeeded(String(editing.freelancers_needed));
  } else if (!editing && filledFromId) {
    // Edit mode ended (the address no longer has ?edit=), so the same job can be edited again later.
    setFilledFromId(null);
  }

  // Bring the form into view when edit mode starts (it is above the list on a phone).
  useEffect(() => {
    if (filledFromId) formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filledFromId]);

  // Empties every box of the form.
  const clearForm = () => {
    setJobType("");
    setTitle("");
    setCategory("");
    setDescription("");
    setSkills([]);
    setSkillInput("");
    setBudget("");
    setBudgetType("project");
    setBudgetTypeChosen(false);
    setStartDate("");
    setDueDate("");
    setFreelancersNeeded("1");
  };

  // Leaves edit mode and empties the form (Cancel, or after saving).
  const stopEditing = () => {
    clearForm();
    setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("job_posts")
      .select(JOB_COLUMNS)
      .eq("client_id", currentUserId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setPosts(error ? [] : data);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // Skills handled by the AI (ai-service/skills.py), part 1: once there is a
  // title and a description to read, it suggests the skills the job needs. It
  // asks again, after a short pause in typing, whenever the text, the category
  // or the chosen skills change (so a tapped skill is replaced by the next best).
  // A slow answer to an older question is ignored (`active`).
  const canSuggest = title.trim().length >= 3 && description.trim().length >= 10;
  useEffect(() => {
    if (postingBlocked || !canSuggest) return undefined;
    let active = true;

    const timer = setTimeout(async () => {
      setSuggestState("loading");
      try {
        const names = await suggestSkills({ title, category, description, have: skills });
        if (!active) return;
        setSuggestions(names);
        setSuggestState("idle");
      } catch {
        if (!active) return;
        setSuggestions([]);
        setSuggestState("offline");
      }
    }, 900);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [postingBlocked, canSuggest, title, category, description, skills]);

  // Picking a type also preselects how the budget is counted (a project is
  // paid per project, an ongoing job per month), unless the client already chose.
  const pickType = (type) => {
    setJobType(type.value);
    if (!budgetTypeChosen) setBudgetType(type.budgetType);
  };

  // Skills handled by the AI, part 2: a skill the client typed is tidied to its
  // standard name when it is the same skill written another way or with a typo
  // ("vid editng" -> "Video Editing"). The chip is added at once, as typed, and
  // renamed when the answer comes; if the AI can't be reached it stays as typed.
  const tidySkill = async (typed) => {
    const standard = await matchSkill(typed);
    if (!standard || standard === typed) return;
    setSkills((prev) => {
      if (!prev.includes(typed)) return prev; // the client already removed it
      // Already there under the standard name: just drop the repeat.
      if (prev.some((s) => s.toLowerCase() === standard.toLowerCase())) return prev.filter((s) => s !== typed);
      return prev.map((s) => (s === typed ? standard : s));
    });
  };

  // Adds the typed skill (or several, split by commas) as chips, skipping
  // blanks and repeats. Returns the new list, so Post Listing can use it
  // right away (a skill typed without pressing Enter isn't lost). A skill the
  // AI suggested already has its standard name, so it isn't tidied again.
  const addSkills = (text, { tidy = true } = {}) => {
    const next = [...skills];
    const added = [];
    for (const part of text.split(",")) {
      const skill = part.trim().slice(0, MAX_SKILL_LENGTH).trim();
      const isRepeat = next.some((s) => s.toLowerCase() === skill.toLowerCase());
      if (skill && !isRepeat && next.length < MAX_SKILLS) {
        next.push(skill);
        added.push(skill);
      }
    }
    setSkills(next);
    setSkillInput("");
    if (tidy) added.forEach(tidySkill);
    return next;
  };

  // The AI's ideas that aren't chosen yet, shown only while there is enough text to read.
  const shownSuggestions = canSuggest ? suggestions.filter((name) => !skills.some((s) => s.toLowerCase() === name.toLowerCase())) : [];

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    if (!jobType) {
      showToast("First choose what you're posting: a one-time project or an ongoing job.");
      typeTop.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // The database refuses wrong dates too (job_posts_start_date_check,
    // job_posts_dates_order_check). When editing, a date that is already past
    // and was not changed is fine.
    const today = todayInManila();
    const changed = (value, field) => !editing || value !== (editing[field] || "");
    if (startDate < today && changed(startDate, "start_date")) {
      showToast("The start date can't be in the past.");
      return;
    }
    if (dueDate < today && changed(dueDate, "due_date")) {
      showToast("The due date can't be in the past.");
      return;
    }
    if (dueDate < startDate) {
      showToast("The due date can't be before the start date.");
      return;
    }
    setSubmitting(true);
    const finalSkills = skillInput.trim() ? addSkills(skillInput) : skills;

    const fields = {
      title: title.trim(),
      category,
      description: description.trim(),
      skills: finalSkills,
      job_type: jobType,
      budget: budget ? Number(budget) : null,
      budget_type: budgetType,
      start_date: startDate,
      due_date: dueDate,
      freelancers_needed: Number(freelancersNeeded)
    };
    // .single() fails when no row was updated (for example when the database
    // refuses because the account is blocked from posting), so that is an error too.
    const { data, error } = editing
      ? await supabase.from("job_posts").update(fields).eq("id", editing.id).select(JOB_COLUMNS).single()
      : await supabase.from("job_posts").insert({ client_id: currentUserId, ...fields }).select(JOB_COLUMNS).single();

    setSubmitting(false);
    if (error) {
      showToast(saveErrorText(error, editing));
      return;
    }

    if (editing) {
      setPosts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      stopEditing();
      showToast(`"${data.title}" was updated.`);
      return;
    }

    setPosts((prev) => [data, ...(prev || [])]);
    clearForm();
    showToast(`Your listing "${data.title}" is live for freelancers to see!`);
  };

  const inputClass = "form-control bg-secondary bg-opacity-25 border-secondary text-white py-2";

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div ref={formTop} className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4">
              <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-circle"} text-role me-2`}></i> {editing ? "Edit Your Job Post" : "Post What You Need"}
            </h3>

            {postingBlocked && <BlockedNotice suspension={suspension} what="post job listings" />}

            {/* A filled or expired post is hidden from freelancers: say what brings it back. */}
            {!postingBlocked && editingState === "expired" && (
              <div className="alert alert-warning fs-7 py-2 mb-3" role="status">
                <i className="bi bi-hourglass-bottom me-1"></i> This post expired on {formatDay(editing.due_date)}, so freelancers can't see it or apply.
                Pick new dates to show it again.
              </div>
            )}
            {!postingBlocked && editingState === "filled" && (
              <div className="alert alert-info fs-7 py-2 mb-3" role="status">
                <i className="bi bi-people-fill me-1"></i> You hired {hiredCount(editing)} of the {editing.freelancers_needed} freelancer{editing.freelancers_needed === 1 ? "" : "s"} you needed, so this post is hidden from freelancers.
                Raise "Freelancers needed" to show it again.
              </div>
            )}

            {!postingBlocked && (
              <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
                <div ref={typeTop}>
                  <div id="jobTypeLabel" className="form-label text-white fw-semibold fs-7">What are you posting?</div>
                  <div className="row g-3" role="radiogroup" aria-labelledby="jobTypeLabel">
                    {JOB_TYPES.map((type) => {
                      const picked = jobType === type.value;
                      return (
                        <div className="col-sm-6" key={type.value}>
                          {/* Same look as the Dark / Light choice in Settings > Appearance. */}
                          <button
                            type="button"
                            role="radio"
                            aria-checked={picked}
                            className={`mode-choice w-100 h-100 text-start rounded-3 p-3 d-flex align-items-center gap-3${picked ? " is-selected" : ""}`}
                            onClick={() => pickType(type)}
                          >
                            <i className={`bi ${type.icon} fs-4 text-role`}></i>
                            <span>
                              <span className="d-block text-white fw-bold fs-7">{type.label}</span>
                              <span className="d-block text-secondary fs-8">{type.hint}</span>
                            </span>
                            {picked && <i className="bi bi-check-circle-fill text-role ms-auto"></i>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label text-white fw-semibold fs-7">Enter the job title:</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Hiring a logo designer for our cafe business"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label text-white fw-semibold fs-7">Select job category:</label>
                  <select className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2" value={category} onChange={(e) => setCategory(e.target.value)} required>
                    <option value="" disabled>Select job category...</option>
                    {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="form-label text-white fw-semibold fs-7">Enter job description:</label>
                  <textarea
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                    rows="5"
                    placeholder="Describe the project, timeline, and what you're looking for..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  ></textarea>
                  <small className="text-secondary fs-8 d-block mt-1">Bad words are hidden automatically.</small>
                </div>

                <div>
                  <label htmlFor="skillInput" className="form-label text-white fw-semibold fs-7">Required skills (optional, up to {MAX_SKILLS}):</label>
                  {skills.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {skills.map((skill) => (
                        <span key={skill} className="badge bg-role text-white rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 fw-semibold">
                          {skill}
                          <button
                            type="button"
                            className="btn-close btn-close-white"
                            style={{ fontSize: "0.55rem" }}
                            aria-label={`Remove ${skill}`}
                            onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}
                          ></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    id="skillInput"
                    type="text"
                    className={inputClass}
                    placeholder={skills.length >= MAX_SKILLS ? "You've added the most skills allowed." : "Type a skill and press Enter, e.g. Video Editing"}
                    value={skillInput}
                    disabled={skills.length >= MAX_SKILLS}
                    // A comma (typed or pasted) turns what's written into chips.
                    onChange={(e) => (e.target.value.includes(",") ? addSkills(e.target.value) : setSkillInput(e.target.value))}
                    onKeyDown={(e) => {
                      // Enter adds the skill instead of sending the form.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkills(skillInput);
                      }
                    }}
                  />
                  {/* The AI reads the title and description and suggests skills; tap one to add it. */}
                  {skills.length < MAX_SKILLS && canSuggest && (suggestState !== "idle" || shownSuggestions.length > 0) && (
                    <div className="d-flex flex-wrap align-items-center gap-2 mt-2" aria-live="polite">
                      {suggestState === "loading" && (
                        <small className="text-secondary fs-8">
                          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Reading your description for skills...
                        </small>
                      )}
                      {suggestState === "offline" && (
                        <small className="text-secondary fs-8"><i className="bi bi-robot me-1"></i>AI skill ideas aren't available right now. You can type the skills yourself.</small>
                      )}
                      {suggestState !== "offline" && shownSuggestions.length > 0 && (
                        <>
                          <small className="text-secondary fs-8"><i className="bi bi-stars text-role me-1"></i>AI suggests:</small>
                          {shownSuggestions.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className="btn btn-sm btn-outline-role rounded-pill px-3 fs-8 fw-semibold"
                              onClick={() => addSkills(name, { tidy: false })}
                            >
                              <i className="bi bi-plus-lg me-1"></i>{name}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Side by side on a laptop, one above the other on a phone. */}
                <div className="row g-3">
                  <div className="col-sm-6">
                    <label htmlFor="jobBudget" className="form-label text-white fw-semibold fs-7">Budget (₱, optional):</label>
                    <input
                      id="jobBudget"
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="e.g. 5000"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>
                  <div className="col-sm-6">
                    <label htmlFor="jobBudgetType" className="form-label text-white fw-semibold fs-7">The budget is counted:</label>
                    <select
                      id="jobBudgetType"
                      className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      value={budgetType}
                      onChange={(e) => {
                        setBudgetType(e.target.value);
                        setBudgetTypeChosen(true);
                      }}
                    >
                      {BUDGET_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <label htmlFor="jobStartDate" className="form-label text-white fw-semibold fs-7">Start date:</label>
                    <input
                      id="jobStartDate"
                      type="date"
                      className={inputClass}
                      // colorScheme: a light calendar icon and a dark calendar, to suit the dark box.
                      style={{ colorScheme: "dark" }}
                      // An old start date that has passed can stay while editing; a new pick must be today or later.
                      min={editing?.start_date && editing.start_date < todayInManila() ? editing.start_date : todayInManila()}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                    <small className="text-secondary fs-8">The day the work begins.</small>
                  </div>

                  <div className="col-sm-6">
                    <label htmlFor="jobDueDate" className="form-label text-white fw-semibold fs-7">Due date:</label>
                    <input
                      id="jobDueDate"
                      type="date"
                      className={inputClass}
                      style={{ colorScheme: "dark" }}
                      // Not before the start date. Freelancers stop seeing the post after this day.
                      min={startDate || todayInManila()}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                    />
                    <small className="text-secondary fs-8">The day it must be done. After it, the post is hidden from freelancers.</small>
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-sm-6">
                    <label htmlFor="jobFreelancersNeeded" className="form-label text-white fw-semibold fs-7">Freelancers needed:</label>
                    <input
                      id="jobFreelancersNeeded"
                      type="number"
                      min="1"
                      max={MAX_FREELANCERS_NEEDED}
                      step="1"
                      className={inputClass}
                      value={freelancersNeeded}
                      onChange={(e) => setFreelancersNeeded(e.target.value)}
                      required
                    />
                    <small className="text-secondary fs-8">Once you've hired this many, the post is hidden from freelancers.</small>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2 pt-2">
                  <button type="submit" className="btn btn-gradient-role btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow-role" disabled={submitting}>
                    {editing ? (submitting ? "Saving..." : "Save changes") : submitting ? "Publishing..." : "Post Job"}
                  </button>
                  {editing && (
                    <button type="button" className="btn btn-outline-secondary text-white-50 btn-lg px-4 py-2 rounded-pill fw-bold" disabled={submitting} onClick={stopEditing}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-fill text-warning me-2"></i> Your Active Listings</h5>

            {posts === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
            {posts !== null && posts.length === 0 && <p className="text-secondary fs-7 mb-0">You haven't posted a listing yet.</p>}

            <div className="d-flex flex-column gap-3">
              {posts?.map((p) => {
                const categoryLabel = getCategory(p.category).label;
                const hired = hiredCount(p);
                const state = jobState(p, hired);
                return (
                  <div key={p.id} className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                      {/* The title opens the job's own page, the way freelancers see it. */}
                      <h6 className="mb-0 text-break">
                        <Link to={`/dashboard/job-details/${p.id}`} className="text-white fw-bold text-decoration-none hover-role"><CensoredText text={p.title} /></Link>
                      </h6>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <Link
                          to={`/dashboard/post-need?edit=${p.id}`}
                          className="btn btn-sm btn-outline-role rounded-circle d-flex align-items-center justify-content-center"
                          style={{ width: 32, height: 32 }}
                          aria-label={`Edit ${p.title}`}
                        >
                          <i className="bi bi-pencil-fill"></i>
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger rounded-circle d-flex align-items-center justify-content-center"
                          style={{ width: 32, height: 32 }}
                          aria-label={`Delete ${p.title}`}
                          onClick={() => setPostToDelete(p)}
                        >
                          <i className="bi bi-trash3-fill"></i>
                        </button>
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      <span className={`badge ${JOB_STATES[state].className} fs-8`}>{JOB_STATES[state].label}</span>
                      <span className="badge bg-role text-white fs-8">{categoryLabel}</span>
                      <span className="badge bg-secondary bg-opacity-50 text-white fs-8">{getJobType(p.job_type).short}</span>
                    </div>
                    <p className="text-secondary fs-8 mb-0">
                      {budgetText(p) || "Budget flexible"} • {new Date(p.created_at).toLocaleDateString()}
                      {p.updated_at && ` • Edited ${new Date(p.updated_at).toLocaleDateString()}`}
                    </p>
                    <p className="text-white-50 fs-8 mb-0 mt-1"><i className="bi bi-calendar-event me-1"></i>{datesText(p)}</p>
                    <p className="text-white-50 fs-8 mb-0 mt-1"><i className="bi bi-people me-1"></i>{hired} of {p.freelancers_needed} hired</p>
                    {/* Brings a hidden post back: the same form, to pick new dates or more openings. */}
                    {state !== "open" && (
                      <Link to={`/dashboard/post-need?edit=${p.id}`} className="btn btn-sm btn-outline-role rounded-pill px-3 mt-2 fs-8 fw-bold">
                        <i className="bi bi-arrow-repeat me-1"></i> Reopen
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DeletePostDialog
        key={postToDelete?.id}
        kind="job"
        post={postToDelete}
        showToast={showToast}
        onCancel={() => setPostToDelete(null)}
        onDeleted={(job) => {
          setPosts((prev) => prev.filter((p) => p.id !== job.id));
          setPostToDelete(null);
          // Deleting the one being edited also closes its form.
          if (job.id === editing?.id) stopEditing();
        }}
      />
    </section>
  );
}
