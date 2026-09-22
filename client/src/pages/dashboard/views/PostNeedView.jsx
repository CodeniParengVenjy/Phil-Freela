import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories, getCategory } from "../../../lib/categories";

export default function PostNeedView() {
  const { currentUserId, showToast } = useOutletContext();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("job_posts")
      .select("id, title, category, budget, created_at")
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from("job_posts")
      .insert({
        client_id: currentUserId,
        title: title.trim(),
        category,
        description: description.trim(),
        budget: budget ? Number(budget) : null
      })
      .select("id, title, category, budget, created_at")
      .single();

    setSubmitting(false);
    if (error) {
      showToast("Couldn't publish that listing. Please try again.");
      return;
    }

    setPosts((prev) => [data, ...(prev || [])]);
    setTitle("");
    setCategory("");
    setDescription("");
    setBudget("");
    showToast(`Your listing "${data.title}" is live for freelancers to see!`);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4"><i className="bi bi-plus-circle text-role me-2"></i> Post What You Need</h3>

            <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
              <div>
                <label className="form-label text-white fw-semibold fs-7">Listing Title:</label>
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
                <label className="form-label text-white fw-semibold fs-7">Select category:</label>
                <select className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2" value={category} onChange={(e) => setCategory(e.target.value)} required>
                  <option value="" disabled>Select category...</option>
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label text-white fw-semibold fs-7">Describe what you need:</label>
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

              <div className="pt-2">
                <button type="submit" className="btn btn-gradient-role btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow-role" disabled={submitting}>
                  {submitting ? "Publishing..." : "Post Listing"}
                </button>
              </div>
            </form>
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
