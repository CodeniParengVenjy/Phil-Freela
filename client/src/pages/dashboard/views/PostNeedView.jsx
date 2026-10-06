import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";
import { isPostingBlocked } from "../../../lib/suspensions";
import { formatDay, todayInManila } from "../../../lib/projects";
import BlockedNotice from "../components/BlockedNotice";

// The database allows up to 10 skills, each up to 40 characters.
const MAX_SKILLS = 10;
const MAX_SKILL_LENGTH = 40;

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

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("job_posts")
      .select("id, title, category, budget, due_date, created_at")
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
    // The database refuses a past due date too (job_posts_due_date_check).
    if (dueDate && dueDate < todayInManila()) {
      showToast("The due date can't be in the past.");
      return;
    }
    setSubmitting(true);
    const finalSkills = skillInput.trim() ? addSkills(skillInput) : skills;

    const { data, error } = await supabase
      .from("job_posts")
      .insert({
        client_id: currentUserId,
        title: title.trim(),
        category,
        description: description.trim(),
        skills: finalSkills,
        due_date: dueDate || null,
        budget: budget ? Number(budget) : null
      })
      .select("id, title, category, budget, due_date, created_at")
      .single();

    setSubmitting(false);
    if (error) {
      // 23514 = a table rule was broken; with a due date set, that's the date rule.
      showToast(error.code === "23514" && dueDate ? "The due date can't be in the past." : "Couldn't publish that listing. Please try again.");
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
          <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4"><i className="bi bi-plus-circle text-role me-2"></i> Post What You Need</h3>

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
                      min={todayInManila()}
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

                <div className="pt-2">
                  <button type="submit" className="btn btn-gradient-role btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow-role" disabled={submitting}>
                    {submitting ? "Publishing..." : "Post Job"}
                  </button>
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
                    <h6 className="text-white fw-bold mb-1">{p.title}</h6>
                    <span className="badge bg-role text-white fs-8 mb-2">{categoryLabel}</span>
                    <p className="text-secondary fs-8 mb-0">
                      {p.budget ? `Budget ₱${Number(p.budget).toLocaleString()}` : "Budget flexible"} • {new Date(p.created_at).toLocaleDateString()}
                    </p>
                    {p.due_date && <p className="text-white-50 fs-8 mb-0 mt-1"><i className="bi bi-calendar-event me-1"></i>Needed by {formatDay(p.due_date)}</p>}
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
