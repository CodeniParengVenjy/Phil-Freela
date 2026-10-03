import { useEffect, useRef, useState } from "react";
import { MAX_SKILLS, addSkillsFromText, fetchSkills, saveSkills } from "../../../lib/profile";

// The Skills box on a freelancer's own Profile. Their saved skills show as chips
// (the same ones appear on their public page). "+ Add Skill" opens a box:
// Enter or a comma adds a skill, the x on a chip removes it, and every change
// is saved right away. If a save fails, the list goes back to how it was.
export default function SkillsBox({ userId, showToast }) {
  // undefined while loading, null when they couldn't load, else the list.
  const [skills, setSkills] = useState(undefined);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;

    fetchSkills(userId).then((result) => {
      if (active) setSkills(result);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  // The box takes the cursor as soon as it opens.
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  // Saves a new list. If it fails, the old list comes back and a message shows.
  const update = async (next) => {
    const before = skills;
    setSkills(next);
    setSaving(true);
    const problem = await saveSkills(userId, next);
    setSaving(false);
    if (problem) {
      setSkills(before);
      showToast(problem);
    }
  };

  const handleAdd = async (text) => {
    // One save at a time. (The box itself stays enabled, so typing isn't interrupted.)
    if (saving) return;
    setInput("");
    const next = addSkillsFromText(skills, text);
    // Nothing new (a blank or a repeat): nothing to save.
    if (next.length === skills.length) return;
    await update(next);
  };

  const full = skills?.length >= MAX_SKILLS;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="text-white fw-bold mb-0"><i className="bi bi-tools text-orange me-2"></i> Skills</h5>
        {skills && !full && !adding && (
          <button type="button" className="btn btn-sm btn-outline-warning rounded-pill fs-8 fw-bold" onClick={() => setAdding(true)}>+ Add Skill</button>
        )}
      </div>

      {skills === undefined && <p className="text-secondary fs-7 mb-0">Loading...</p>}
      {skills === null && <p className="text-secondary fs-7 mb-0">Couldn't load your skills.</p>}
      {skills?.length === 0 && !adding && (
        <p className="text-secondary fs-7 mb-0">No skills yet. Add the ones clients should know about.</p>
      )}

      {skills?.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {skills.map((skill) => (
            <span key={skill} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7 d-inline-flex align-items-center gap-2">
              {skill}
              <button
                type="button"
                className="btn-close btn-close-white"
                style={{ fontSize: "0.55rem" }}
                aria-label={`Remove ${skill}`}
                disabled={saving}
                onClick={() => update(skills.filter((s) => s !== skill))}
              ></button>
            </span>
          ))}
        </div>
      )}

      {skills && adding && !full && (
        <input
          ref={inputRef}
          type="text"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 mt-3"
          placeholder="Type a skill and press Enter, e.g. Video Editing"
          aria-label="New skill"
          value={input}
          // A comma (typed or pasted) turns what's written into skills.
          onChange={(event) => (event.target.value.includes(",") ? handleAdd(event.target.value) : setInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd(input);
            }
            if (event.key === "Escape") {
              setInput("");
              setAdding(false);
            }
          }}
          // A skill typed without pressing Enter isn't lost.
          onBlur={() => {
            if (input.trim()) handleAdd(input);
            setAdding(false);
          }}
        />
      )}
      {full && <p className="text-secondary fs-8 mt-2 mb-0">You've added the most skills allowed ({MAX_SKILLS}).</p>}
    </div>
  );
}
