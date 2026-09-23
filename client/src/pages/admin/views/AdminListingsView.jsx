import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { storagePathFromUrl } from "../../../lib/storage";
import { categories, getCategory } from "../../../lib/categories";

// The two kinds of listings share one page. Each tab says which table it
// reads, which column holds the owner, and how its price is labeled.
const tabs = {
  services: {
    label: "Services",
    table: "services",
    ownerColumn: "freelancer_id",
    priceColumn: "price",
    priceLabel: "Price",
    select: "id, title, category, description, price, skill, image_url, media_type, created_at, freelancer_id, owner:profiles!services_freelancer_id_fkey(full_name, username)"
  },
  jobs: {
    label: "Job Posts",
    table: "job_posts",
    ownerColumn: "client_id",
    priceColumn: "budget",
    priceLabel: "Budget",
    select: "id, title, category, description, budget, created_at, client_id, owner:profiles!job_posts_client_id_fkey(full_name, username)"
  }
};

const formatPeso = (value) => (value ? `₱${Number(value).toLocaleString()}` : "—");

export default function AdminListingsView() {
  const [activeTab, setActiveTab] = useState("services");
  // Both lists load once; switching tabs just shows the other one.
  const [listings, setListings] = useState({ services: null, jobs: null });
  const [suspendedIds, setSuspendedIds] = useState(new Set());
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The listing open in the "View" pop-up (null = closed).
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const [servicesResult, jobsResult, suspensionsResult] = await Promise.all([
        supabase.from("services").select(tabs.services.select).order("created_at", { ascending: false }),
        supabase.from("job_posts").select(tabs.jobs.select).order("created_at", { ascending: false }),
        supabase.from("user_suspensions").select("user_id")
      ]);

      if (!active) return;

      if (servicesResult.error || jobsResult.error || suspensionsResult.error) {
        setLoadError("Failed to load listings.");
        return;
      }

      setListings({ services: servicesResult.data, jobs: jobsResult.data });
      setSuspendedIds(new Set(suspensionsResult.data.map((s) => s.user_id)));
    })();

    return () => { active = false; };
  }, []);

  const tab = tabs[activeTab];
  const currentList = listings[activeTab];

  // Apply the search box (title or owner) and the category filter.
  const searchText = search.trim().toLowerCase();
  const visibleListings = (currentList || []).filter((item) => {
    const matchesSearch = !searchText
      || item.title.toLowerCase().includes(searchText)
      || (item.owner?.full_name || "").toLowerCase().includes(searchText)
      || (item.owner?.username || "").toLowerCase().includes(searchText);
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const switchTab = (key) => {
    setActiveTab(key);
    setMessage({ text: "", type: "" });
  };

  const removeListing = async (item) => {
    if (!window.confirm(`Remove "${item.title}"? The owner will no longer see it, and this cannot be undone.`)) return;

    // The "admins can delete any" database rules allow this. .select("id")
    // returns the deleted rows, so an empty result means nothing was deleted.
    const { data, error } = await supabase.from(tab.table).delete().eq("id", item.id).select("id");
    if (error || !data?.length) {
      setMessage({ text: "Couldn't remove that listing. Please try again.", type: "error" });
      return;
    }

    // Services may have a photo/video in storage; delete it too so no unused
    // file is left behind. A failure here only leaves a stray file.
    const path = storagePathFromUrl(item.image_url);
    if (path) await supabase.storage.from("marketplace-images").remove([path]);

    setListings((prev) => ({ ...prev, [activeTab]: prev[activeTab].filter((l) => l.id !== item.id) }));
    setViewing(null);
    setMessage({ text: `"${item.title}" was removed.`, type: "success" });
  };

  const ownerCell = (item) => (
    <>
      <div>{item.owner?.full_name || "Unknown"}</div>
      <div className="text-white-50 fs-8">
        @{item.owner?.username || "?"}
        {suspendedIds.has(item[tab.ownerColumn]) && <span className="badge bg-danger fw-normal ms-2">Suspended</span>}
      </div>
    </>
  );

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Listings</h1>

      {/* Tabs: Services / Job Posts, with how many each has */}
      <div className="d-flex gap-2 mb-3">
        {Object.entries(tabs).map(([key, t]) => (
          <button
            key={key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeTab === key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => switchTab(key)}
          >
            {t.label} <span className="ms-1 opacity-75">({listings[key] ? listings[key].length : "…"})</span>
          </button>
        ))}
      </div>

      <div className="admin-card rounded-4 p-3 mb-3">
        <div className="row g-2">
          <div className="col-12 col-lg-8">
            <input
              type="search"
              className="form-control admin-input"
              placeholder="Search by title or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-12 col-lg-4">
            <select className="form-select admin-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <div className="table-responsive">
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Owner</th>
                <th>{tab.priceLabel}</th>
                <th>Posted</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadError && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">{loadError}</td></tr>
              )}
              {!loadError && currentList === null && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">Loading listings...</td></tr>
              )}
              {!loadError && currentList !== null && visibleListings.length === 0 && (
                <tr><td colSpan={6} className="text-center text-white-50 py-4">No {tab.label.toLowerCase()} found.</td></tr>
              )}
              {!loadError && visibleListings.map((item) => (
                <tr key={item.id}>
                  <td className="admin-title-cell">{item.title}</td>
                  <td className="fs-7">{getCategory(item.category).label}</td>
                  <td>{ownerCell(item)}</td>
                  <td>{formatPeso(item[tab.priceColumn])}</td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="text-end text-nowrap">
                    <button className="btn btn-outline-light btn-sm me-2" onClick={() => setViewing(item)}>
                      <i className="bi bi-eye"></i> View
                    </button>
                    <button className="btn btn-outline-danger btn-sm" onClick={() => removeListing(item)}>
                      <i className="bi bi-trash"></i> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View pop-up: the full listing, including description and photo/video */}
      {viewing && (
        <div className="admin-modal-backdrop" onClick={() => setViewing(null)}>
          <div className="admin-card admin-modal admin-modal-wide rounded-4 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
              <h2 className="h5 fw-bold text-white mb-0">{viewing.title}</h2>
              <button className="btn btn-sm btn-outline-light rounded-circle" onClick={() => setViewing(null)} aria-label="Close">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <p className="text-secondary fs-7 mb-3">
              {getCategory(viewing.category).label} • {tab.priceLabel}: {formatPeso(viewing[tab.priceColumn])} • Posted {new Date(viewing.created_at).toLocaleDateString()}
            </p>

            {viewing.image_url && viewing.media_type === "video" && (
              <video src={viewing.image_url} controls className="rounded-3 w-100 mb-3 admin-modal-media" />
            )}
            {viewing.image_url && viewing.media_type !== "video" && (
              <img src={viewing.image_url} alt={viewing.title} className="rounded-3 w-100 mb-3 admin-modal-media" />
            )}

            <div className="mb-3">{ownerCell(viewing)}</div>
            {viewing.skill && <p className="fs-7 mb-2"><span className="text-white-50">Skill:</span> {viewing.skill}</p>}
            <p className="fs-7 text-white mb-4 admin-description">{viewing.description}</p>

            <div className="d-flex justify-content-end">
              <button className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={() => removeListing(viewing)}>
                <i className="bi bi-trash me-1"></i> Remove Listing
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
