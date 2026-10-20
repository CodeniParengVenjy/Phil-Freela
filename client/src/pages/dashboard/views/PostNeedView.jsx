import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";
import { isPostingBlocked } from "../../../lib/suspensions";
import { formatDay, todayInManila } from "../../../lib/projects";
import BlockedNotice from "../components/BlockedNotice";
import DeletePostDialog from "../components/DeletePostDialog";

// The database allows up to 10 skills, each up to 40 characters.
const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 40;

// description and skills are here so the Edit form can be filled in from the list.
const JOB_COLUMNS = "id, title, category, description, skills, budget, due_date, created_at, updated_at";

export default function PostNeedView() {
  const { currentUserId, showToast, suspension } = useOutletContext();
  // Suspended for a posting violation (e.g. spam): the form is replaced by a notice.
  const postingBlocked = isPostingBlocked(suspension);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  // Required skills, shown as chips on the job page (e.g. "Video Editing").
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  // The day the client needs the work by, as "YYYY-MM-DD" ("" = not set).
  // It shows on the job's page and fills in the Hire popup later.
  const [dueDate, setDueDate] = useState("");
  const [budget, setBudget] = useState("");
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
  const formTop = useRef(null);
  // Which job the form was last filled in from.
  const [filledFromId, setFilledFromId] = useState(null);
  if (editing && filledFromId !== editing.id) {
    // Filled in while rendering (React allows this for state of this same
    // component), so the form never shows the old text for a moment.
    setFilledFromId(editing.id);
    setTitle(editing.title);
    setCategory(editing.category);
    setDescription(editing.description);
    setSkills(editing.skills || []);
    setSkillInput("");
    setDueDate(editing.due_date || "");
    setBudget(editing.budget ? String(editing.budget) : "");
  } else if (!editing && filledFromId) {
    // Edit mode ended (the address no longer has ?edit=), so the same job can be edited again later.
    setFilledFromId(null);
  }

  // Bring the form into view when edit mode starts (it is above the list on a phone).
  useEffect(() => {
    if (filledFromId) formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filledFromId]);

  // Leaves edit mode and empties the form (Cancel, or after saving).
  const stopEditing = () => {
    setTitle("");
    setCategory("");
    setDescription("");
    setSkills([]);
    setSkillInput("");
    setDueDate("");
    setBudget("");
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

  // Adds the typed skill (or several, split by commas) as chips, skipping
  // blanks and repeats. Returns the new list, so Post Listing can use it
  // right away (a skill typed without pressing Enter isn't lost).
  const addSkills = (text) => {
    const next = [...skills];
    for (const part of text.split(",")) {
      const skill = part.trim().slice(0, MAX_SKILL_LENGTH).trim();
      const isRepeat = next.some((s) => s.toLowerCase() === skill.toLowerCase());
      if (skill && !isRepeat && next.length < MAX_SKILLS) next.push(skill);
    }
    setSkills(next);
    setSkillInput("");
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    // The database refuses a past due date too (job_posts_due_date_check). When
    // editing, a due date that is already past and was not changed is fine.
    const dateChanged = !editing || dueDate !== (editing.due_date || "");
    if (dueDate && dateChanged && dueDate < todayInManila()) {
      showToast("The due date can't be in the past.");
      return;
    }
    setSubmitting(true);
    const finalSkills = skillInput.trim() ? addSkills(skillInput) : skills;

    const fields = {
      title: title.trim(),
      category,
      description: description.trim(),
      skills: finalSkills,
      due_date: dueDate || null,
      budget: budget ? Number(budget) : null
    };
    // .single() fails when no row was updated (for example when the database
    // refuses because the account is blocked from posting), so that is an error too.
    const { data, error } = editing
      ? await supabase.from("job_posts").update(fields).eq("id", editing.id).select(JOB_COLUMNS).single()
      : await supabase.from("job_posts").insert({ client_id: currentUserId, ...fields }).select(JOB_COLUMNS).single();

    setSubmitting(false);
    if (error) {
      // 23514 = a table rule was broken; with a due date set, that's the date rule.
      const failed = editing ? "Couldn't save your changes. Please try again." : "Couldn't publish that listing. Please try again.";
      showToast(error.code === "23514" && dueDate ? "The due date can't be in the past." : failed);
      return;
    }

    if (editing) {
      setPosts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      stopEditing();
      showToast(`"${data.title}" was updated.`);
      return;
    }

    setPosts((prev) => [data, ...(prev || [])]);
    setTitle("");
    setCategory("");
    setDescription("");
    setSkills([]);
    setDueDate("");
    setBudget("");
    showToast(`Your listing "${data.title}" is live for freelancers to see!`);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div ref={formTop} className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4">
              <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-circle"} text-role me-2`}></i> {editing ? "Edit Your Job Post" : "Post What You Need"}
            </h3>

            {postingBlocked && <BlockedNotice suspension={suspension} what="post job listings" />}

            {!postingBlocked && (
              <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
                <div>
                  <label className="form-label text-white fw-semibold fs-7">Enter the job title:</label>
                  <input
                    type="text"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
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
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
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
                </div>

                {/* Side by side on a laptop, one above the other on a phone. */}
                <div className="row g-3">
                  <div className="col-sm-6">
                    <label htmlFor="jobDueDate" className="form-label text-white fw-semibold fs-7">Due date (optional):</label>
                    <input
                      id="jobDueDate"
                      type="date"
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      // colorScheme: a light calendar icon and a dark calendar, to suit the dark box.
                      style={{ colorScheme: "dark" }}
                      // An old due date that has passed can stay while editing; a new pick must be today or later.
                      min={editing?.due_date && editing.due_date < todayInManila() ? editing.due_date : todayInManila()}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                    <small className="text-secondary fs-8">The day you need the work by.</small>
                  </div>

                  <div className="col-sm-6">
                    <label className="form-label text-white fw-semibold fs-7">Budget (₱):</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      placeholder="e.g. 5000"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
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
                return (
                  <div key={p.id} className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                      {/* The title opens the job's own page, the way freelancers see it. */}
                      <h6 className="mb-0 text-break">
                        <Link to={`/dashboard/job-details/${p.id}`} className="text-white fw-bold text-decoration-none hover-role">{p.title}</Link>
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
                    <span className="badge bg-role text-white fs-8 mb-2">{categoryLabel}</span>
                    <p className="text-secondary fs-8 mb-0">
                      {p.budget ? `Budget ₱${Number(p.budget).toLocaleString()}` : "Budget flexible"} • {new Date(p.created_at).toLocaleDateString()}
                      {p.updated_at && ` • Edited ${new Date(p.updated_at).toLocaleDateString()}`}
                    </p>
                    {p.due_date && <p className="text-white-50 fs-8 mb-0 mt-1"><i className="bi bi-calendar-event me-1"></i>Needed by {formatDay(p.due_date)}</p>}
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
