import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { matchSkill, suggestSkills } from "../../../lib/aiService";
import { categories, getCategory } from "../../../lib/categories";
import { isPostingBlocked } from "../../../lib/suspensions";
import { fetchIsVerified } from "../../../lib/verification";
import { useFeatureStatus } from "../../../lib/featured";
import { claimFreeFeature, getFreeFeature, useMyViews } from "../../../lib/pro";
import { formatDay, todayInManila } from "../../../lib/projects";
import { BUDGET_TYPES, HIRES_FIELD, JOB_STATES, JOB_TYPES, MAX_FREELANCERS_NEEDED, budgetText, datesText, getJobType, hiredCount, hiresOf, jobState } from "../../../lib/jobTerms";
import BlockedNotice from "../components/BlockedNotice";
import DeletePostDialog from "../components/DeletePostDialog";
import FeatureControl from "../components/FeatureControl";
import PromoPayDialog from "../components/PromoPayDialog";
import HiredFreelancers from "../components/HiredFreelancers";
import CensoredText from "../../../components/CensoredText";

// The database allows up to 10 skills, each up to 40 characters.
const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 40;
const NO_AI_ANSWER = { skills: [], more: [] };

// Whether a list of skills has this one, in any capitalization.
const hasSkill = (list, name) => list.some((s) => s.toLowerCase() === name.toLowerCase());

// description and skills are here so the Edit form can be filled in from the list.
// hired:projects(count) is how many freelancers were hired from the post (the
// owner can read their own projects), for the Open / Filled badge; HIRES_FIELD is
// who they are, for the "Hired freelancers" list under each post.
const JOB_COLUMNS =
  `id, title, category, description, skills, budget, budget_type, job_type, freelancers_needed, start_date, due_date, created_at, updated_at, hired:projects(count), ${HIRES_FIELD}`;

// The sentence for a save the database refused. 23514 = a table rule was broken;
// the message names which one.
function saveErrorText(error, editing) {
  const text = error.message || "";
  if (error.code === "23514") {
    if (text.includes("job_posts_start_date_check")) return "The start date can't be before the day you posted this job.";
    if (text.includes("job_posts_dates_order_check")) return "The due date can't be before the start date.";
    if (text.includes("job_posts_type_budget_check")) return "A one-time project is counted per project, and an ongoing job per day or per month.";
    if (text.includes("job_posts_due_date_check")) return "The due date can't be in the past.";
    if (text.includes("job_posts_freelancers_needed_check")) return `Freelancers needed must be from 1 to ${MAX_FREELANCERS_NEEDED}.`;
  }
  return editing ? "Couldn't save your changes. Please try again." : "Couldn't publish that listing. Please try again.";
}

export default function PostNeedView() {
  const { currentUserId, showToast, suspension, isPro } = useOutletContext();
  // Suspended for a posting violation (e.g. spam): the form is replaced by a notice.
  const postingBlocked = isPostingBlocked(suspension);
  // Only clients with a verified identity can post, the same as freelancers
  // and their services (the database refuses it too, "job_posts: clients can
  // insert own"). null while checking; false = the form is replaced by a
  // "Verify your identity" notice.
  const [isVerified, setIsVerified] = useState(null);
  // What is being posted: "project" or "job" ("" = not chosen yet). The client
  // picks it first and then sees only that type's own form (a project and an
  // ongoing job are two separate forms, so they never mix on one screen).
  const [jobType, setJobType] = useState("");
  const pickedType = JOB_TYPES.find((type) => type.value === jobType) || null;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  // Required skills, shown as chips on the job page (e.g. "Video Editing"). The
  // AI fills them in (see `skills` below); these are the ones the client added
  // (typed, or tapped from the AI's other ideas) and the ones they removed.
  const [ownSkills, setOwnSkills] = useState([]);
  const [removedSkills, setRemovedSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  // The AI's answer for what's written so far: `skills` it is sure of (filled
  // in by themselves) and `more` ideas to tap. suggestState: "idle" (not asked
  // yet), "loading", "done" or "offline" (the AI couldn't be reached).
  const [aiAnswer, setAiAnswer] = useState(NO_AI_ANSWER);
  const [suggestState, setSuggestState] = useState("idle");
  const [budget, setBudget] = useState("");
  // What the budget counts: "project", "day" or "month". The type decides which
  // are allowed: a one-time project is per project only, an ongoing job is per
  // day or per month.
  const [budgetType, setBudgetType] = useState("project");
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
  // Which job posts are Featured now or have a payment waiting, and the post in
  // the "Feature this post" pay window (null = closed).
  const featured = useFeatureStatus(currentUserId);
  const [postToFeature, setPostToFeature] = useState(null);
  // Premium's perks on this list: how many people opened each post, and the free
  // Featured post every 30 days ({ available } once read; null otherwise).
  const views = useMyViews(currentUserId);
  const [freeFeature, setFreeFeature] = useState(null);
  const [freeRound, setFreeRound] = useState(0);
  useEffect(() => {
    if (!currentUserId || !isPro) return undefined;
    let active = true;
    getFreeFeature().then((result) => {
      if (active) setFreeFeature(result);
    });
    return () => {
      active = false;
    };
  }, [currentUserId, isPro, freeRound]);

  // Uses the free Featured post on one job post (the database checks it again).
  const featureForFree = async (post) => {
    const result = await claimFreeFeature({ job: post.id });
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(`"${post.title}" is Featured for 3 days, free with Premium.`);
    featured.reload();
    setFreeRound((n) => n + 1);
  };

  // Edit mode: /dashboard/post-need?edit=<job id> (the pencil buttons link
  // here). The form is filled in from that job and "Save changes" updates it
  // instead of posting a new one. Only your own jobs are in the list, so
  // someone else's id finds nothing and the form stays the normal one.
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const editing = (editId && posts?.find((p) => p.id === editId)) || null;
  const editingState = editing ? jobState(editing, hiredCount(editing)) : null;
  const formTop = useRef(null);
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
    setOwnSkills(editing.skills || []);
    setRemovedSkills([]);
    setAiAnswer(NO_AI_ANSWER);
    setSuggestState("idle");
    setSkillInput("");
    setBudget(editing.budget ? String(editing.budget) : "");
    setBudgetType(editing.budget_type);
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
    setOwnSkills([]);
    setRemovedSkills([]);
    setAiAnswer(NO_AI_ANSWER);
    setSuggestState("idle");
    setSkillInput("");
    setBudget("");
    setBudgetType("project");
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
    if (!currentUserId) return undefined;
    let active = true;
    fetchIsVerified(currentUserId).then((result) => {
      if (active) setIsVerified(result);
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

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
  // title and a description to read, it works out the skills the job needs.
  // It reads them again, after a short pause in typing, whenever the text or
  // the category change. A slow answer to an older question is ignored (`active`).
  const canSuggest = Boolean(pickedType) && title.trim().length >= 3 && description.trim().length >= 10;
  useEffect(() => {
    if (postingBlocked || !isVerified || !canSuggest) return undefined;
    let active = true;

    const timer = setTimeout(async () => {
      setSuggestState("loading");
      try {
        const answer = await suggestSkills({ title, category, description });
        if (!active) return;
        setAiAnswer(answer);
        setSuggestState("done");
      } catch {
        if (!active) return;
        setAiAnswer(NO_AI_ANSWER);
        setSuggestState("offline");
      }
    }, 900);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [postingBlocked, isVerified, canSuggest, title, category, description]);

  // The AI fills in the skills it is sure of by itself, except the ones the
  // client removed. An old post opened for editing keeps its saved skills
  // until its text changes: until then the AI's skills are only ideas to tap.
  const textUnchanged = Boolean(editing) && title === editing.title && category === editing.category && description === editing.description;
  const aiFills = canSuggest && !textUnchanged;
  // The skills on the post: the client's own, then the AI's (at most MAX_SKILLS in all).
  const withAiSkills = (own) => {
    const fill = aiFills ? aiAnswer.skills.filter((name) => !hasSkill(own, name) && !hasSkill(removedSkills, name)) : [];
    return [...own, ...fill].slice(0, MAX_SKILLS);
  };
  const skills = withAiSkills(ownSkills);
  // The AI's other ideas (and the ones the client removed, so a removal can be
  // undone with a tap), shown only while there is enough text to read.
  const aiIdeas = canSuggest ? [...aiAnswer.skills, ...aiAnswer.more].filter((name) => !hasSkill(skills, name)) : [];

  // Picking a type shows that type's form. It also sets how the budget is
  // counted: a one-time project is per project only; an ongoing job is per day
  // or per month, so a choice made for the other type no longer fits and the
  // usual one (per month) is used. What was typed so far stays (after "Change type").
  const pickType = (type) => {
    setJobType(type.value);
    if (!type.budgetTypes.includes(budgetType)) setBudgetType(type.budgetType);
  };

  // Skills handled by the AI, part 2: a skill the client typed is tidied to its
  // standard name when it is the same skill written another way or with a typo
  // ("vid editng" -> "Video Editing"). The chip is added at once, as typed, and
  // renamed when the answer comes; if the AI can't be reached it stays as typed.
  const tidySkill = async (typed) => {
    const standard = await matchSkill(typed);
    if (!standard || standard === typed) return;
    setOwnSkills((prev) => {
      if (!prev.includes(typed)) return prev; // the client already removed it
      // Already there under the standard name: just drop the repeat. (Only the
      // OTHER chips count: "react" is the same as "React" and becomes it.)
      if (hasSkill(prev.filter((s) => s !== typed), standard)) return prev.filter((s) => s !== typed);
      return prev.map((s) => (s === typed ? standard : s));
    });
  };

  // Adds the typed skill (or several, split by commas) as chips, skipping
  // blanks and skills already on the post. Returns the client's new list, so
  // Post Listing can use it right away (a skill typed without pressing Enter
  // isn't lost). A skill the AI found already has its standard name, so it
  // isn't tidied again.
  const addSkills = (text, { tidy = true } = {}) => {
    const next = [...ownSkills];
    const added = [];
    for (const part of text.split(",")) {
      const skill = part.trim().slice(0, MAX_SKILL_LENGTH).trim();
      const onPost = withAiSkills(next);
      if (skill && !hasSkill(onPost, skill) && onPost.length < MAX_SKILLS) {
        next.push(skill);
        added.push(skill);
      }
    }
    setOwnSkills(next);
    setSkillInput("");
    if (tidy) added.forEach(tidySkill);
    return next;
  };

  // Removes a chip. The AI won't fill that skill in again on this form (it
  // stays among its ideas, to tap if it was a mistake).
  const removeSkill = (name) => {
    setOwnSkills((prev) => prev.filter((s) => s !== name));
    setRemovedSkills((prev) => [...prev, name]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId || !pickedType || !isVerified) return;
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
    const finalSkills = skillInput.trim() ? withAiSkills(addSkills(skillInput)) : skills;

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
  // The ways of counting the budget the picked type allows (per project, or per day / per month).
  const budgetChoices = pickedType ? BUDGET_TYPES.filter((type) => pickedType.budgetTypes.includes(type.value)) : [];
  // The page's title: the picker, then the picked type's own form (or its edit form).
  const pageHeading = pickedType ? (editing ? pickedType.editHeading : pickedType.heading) : "Post What You Need";
  // The choice and the form show only for a verified client who isn't blocked from posting.
  const canPost = !postingBlocked && isVerified === true;

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div ref={formTop} className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
              <h3 className="text-white fw-bold mb-0">
                <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-circle"} text-role me-2`}></i> {pageHeading}
              </h3>
              {/* Back to the two choices. Not while editing: a post keeps its type. */}
              {pickedType && !editing && canPost && (
                <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 fw-semibold" onClick={() => setJobType("")}>
                  <i className="bi bi-arrow-left-right me-1"></i> Change type
                </button>
              )}
            </div>

            {postingBlocked && <BlockedNotice suspension={suspension} what="post job listings" />}

            {!postingBlocked && isVerified === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}

            {!postingBlocked && isVerified === false && (
              <div className="text-center py-4">
                <i className="bi bi-shield-lock text-warning" style={{ fontSize: "2.75rem" }}></i>
                <h5 className="text-white fw-bold mt-3 mb-2">Verify your identity to post projects</h5>
                <p className="text-secondary fs-7 mb-4 mx-auto" style={{ maxWidth: 460 }}>
                  To keep freelancers safe, only clients with a verified identity can post projects and jobs.
                  It takes a few minutes: a photo of your government ID and a quick face scan.
                </p>
                <Link to="/dashboard/verify-identity" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white">
                  <i className="bi bi-patch-check me-1"></i> Verify now
                </Link>
              </div>
            )}

            {/* A filled or expired post is hidden from freelancers: say what brings it back. */}
            {canPost && editingState === "expired" && (
              <div className="alert alert-warning fs-7 py-2 mb-3" role="status">
                <i className="bi bi-hourglass-bottom me-1"></i> This post expired on {formatDay(editing.due_date)}, so freelancers can't see it or apply.
                Pick new dates to show it again.
              </div>
            )}
            {canPost && editingState === "filled" && (
              <div className="alert alert-info fs-7 py-2 mb-3" role="status">
                <i className="bi bi-people-fill me-1"></i> You hired {hiredCount(editing)} of the {editing.freelancers_needed} freelancer{editing.freelancers_needed === 1 ? "" : "s"} you needed, so this post is hidden from freelancers.
                Raise "Freelancers needed" to show it again.
              </div>
            )}

            {/* Step 1: what are you posting? Two choices; the form for the one picked shows next. */}
            {/* (data-tour: parts the opening tour points at, components/WelcomeGuide.jsx) */}
            {canPost && !pickedType && (
              <div data-tour="post-type">
                <p className="text-white fw-semibold fs-7 mb-2">What are you posting?</p>
                <div className="row g-3">
                  {JOB_TYPES.map((type) => (
                    <div className="col-md-6" key={type.value}>
                      {/* Same look as the Dark / Light choice in Settings > Appearance. */}
                      <button type="button" className="mode-choice w-100 h-100 text-start rounded-3 p-4 d-flex flex-column gap-2" onClick={() => pickType(type)}>
                        <i className={`bi ${type.icon} fs-2 text-role`}></i>
                        <span className="text-white fw-bold">{type.label}</span>
                        <span className="text-secondary fs-7">{type.hint}</span>
                        <span className="text-role fw-semibold fs-7 mt-auto pt-2">{type.heading} <i className="bi bi-arrow-right ms-1"></i></span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: the form of the type picked. A project and an ongoing job have their own wording and their own way of counting the money. */}
            {canPost && pickedType && (
              <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
                <div data-tour="post-title">
                  <label className="form-label text-white fw-semibold fs-7">{pickedType.titleLabel}</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder={pickedType.titlePlaceholder}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div data-tour="post-category">
                  <label className="form-label text-white fw-semibold fs-7">Select category:</label>
                  <select className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2" value={category} onChange={(e) => setCategory(e.target.value)} required>
                    <option value="" disabled>Select category...</option>
                    {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div data-tour="post-description">
                  <label className="form-label text-white fw-semibold fs-7">{pickedType.descriptionLabel}</label>
                  <textarea
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                    rows="5"
                    placeholder={pickedType.descriptionPlaceholder}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  ></textarea>
                  <small className="text-secondary fs-8 d-block mt-1">Bad words are hidden automatically.</small>
                </div>

                {/* Required skills: the AI reads the title and description and fills
                    them in by itself (the chips with a star). The client can remove
                    one, tap one of the AI's other ideas, or type their own. */}
                <div data-tour="post-skills">
                  <label htmlFor="skillInput" className="form-label text-white fw-semibold fs-7">Required skills (filled in by the AI, up to {MAX_SKILLS}):</label>
                  {skills.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {skills.map((skill) => {
                        const byAi = !hasSkill(ownSkills, skill);
                        return (
                          <span
                            key={skill}
                            className="badge bg-role text-white rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 fw-semibold"
                            title={byAi ? "Filled in by the AI" : undefined}
                          >
                            {byAi && <i className="bi bi-stars" aria-hidden="true"></i>}
                            {skill}
                            {byAi && <span className="visually-hidden"> (filled in by the AI)</span>}
                            <button
                              type="button"
                              className="btn-close btn-close-white"
                              style={{ fontSize: "0.55rem" }}
                              aria-label={`Remove ${skill}`}
                              onClick={() => removeSkill(skill)}
                            ></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {/* What the AI is doing, one line at a time. */}
                  <small className="text-secondary fs-8 d-block mb-2" aria-live="polite">
                    {canSuggest && suggestState === "loading" ? (
                      <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Reading your description for skills...</>
                    ) : canSuggest && suggestState === "offline" ? (
                      <><i className="bi bi-robot me-1"></i>The AI can't be reached right now. You can type the skills yourself.</>
                    ) : canSuggest && suggestState === "done" && aiAnswer.skills.length + aiAnswer.more.length === 0 ? (
                      <><i className="bi bi-robot me-1"></i>The AI found no skills in your description. Add more details about the work, or type the skills yourself.</>
                    ) : !canSuggest && skills.length === 0 ? (
                      <><i className="bi bi-stars text-role me-1"></i>Write the title and the description first: the AI reads them and fills in the skills.</>
                    ) : skills.some((skill) => !hasSkill(ownSkills, skill)) ? (
                      <><i className="bi bi-stars text-role me-1"></i>Filled in by the AI from your description. Remove any that don't fit.</>
                    ) : null}
                  </small>
                  <input
                    id="skillInput"
                    type="text"
                    className={inputClass}
                    placeholder={skills.length >= MAX_SKILLS ? "You've added the most skills allowed." : "Add a skill yourself and press Enter, e.g. Video Editing"}
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
                  {/* The AI's other ideas; tap one to add it. */}
                  {skills.length < MAX_SKILLS && suggestState !== "offline" && aiIdeas.length > 0 && (
                    <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                      <small className="text-secondary fs-8"><i className="bi bi-stars text-role me-1"></i>{aiFills ? "Other skills the AI found:" : "The AI suggests:"}</small>
                      {aiIdeas.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="btn btn-sm btn-outline-role rounded-pill px-3 fs-8 fw-semibold"
                          onClick={() => addSkills(name, { tidy: false })}
                        >
                          <i className="bi bi-plus-lg me-1"></i>{name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* The money. A project has one price for the whole project (nothing to
                    choose, so "per project" is just written there); an ongoing job is
                    paid per day or per month, which the client picks. */}
                <div data-tour="post-budget">
                  <label htmlFor="jobBudget" className="form-label text-white fw-semibold fs-7">{pickedType.moneyLabel}</label>
                  <div className="input-group">
                    <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50">₱</span>
                    <input
                      id="jobBudget"
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder={pickedType.moneyPlaceholder}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                    {budgetChoices.length < 2 ? (
                      <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50">per project</span>
                    ) : (
                      <select
                        id="jobBudgetType"
                        aria-label="Paid per day or per month"
                        className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2 flex-grow-0"
                        style={{ width: "9.5rem" }}
                        value={budgetType}
                        onChange={(e) => setBudgetType(e.target.value)}
                      >
                        {budgetChoices.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div data-tour="post-dates" className="row g-3">
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
                    <small className="text-secondary fs-8">{pickedType.dueHint}</small>
                  </div>
                </div>

                <div className="row g-3">
                  <div data-tour="post-needed" className="col-sm-6">
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
                  <button type="submit" data-tour="post-submit" className="btn btn-gradient-role btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow-role" disabled={submitting}>
                    {editing ? (submitting ? "Saving..." : "Save changes") : submitting ? "Publishing..." : pickedType.submit}
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
          <div data-tour="post-list" className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
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
                    {/* Who they are, and a button to each one's project. */}
                    <HiredFreelancers hires={hiresOf(p)} />
                    {/* Only an open post can be Featured (a filled or expired one is hidden from freelancers anyway). */}
                    <div className="mt-2">
                      <FeatureControl
                        until={featured.until.get(p.id)}
                        waiting={featured.waiting.has(p.id)}
                        canFeature={state === "open" && canPost}
                        onFeature={() => setPostToFeature({ kind: "job", id: p.id, title: p.title })}
                        free={isPro ? freeFeature : null}
                        onUseFree={() => featureForFree(p)}
                        views={views.loaded && views.premium ? views.jobs.get(p.id) ?? 0 : undefined}
                      />
                    </div>
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

      {postToFeature && (
        <PromoPayDialog
          target={postToFeature}
          userId={currentUserId}
          until={featured.until.get(postToFeature.id)}
          onClose={() => setPostToFeature(null)}
          onSent={() => {
            setPostToFeature(null);
            featured.reload();
            showToast("Payment sent. An admin will check it, and you'll get a notification.");
          }}
        />
      )}

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
