import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import ServiceCard from "../components/ServiceCard";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";

const initialResumes = [
  { name: "Peter Cruz", icon: "bi-person-fill", avatar: "bg-success" },
  { name: "Dennis Sandehas", icon: "bi-person", avatar: "bg-secondary" }
];

const initialProjects = [
  { name: "Dennis Sandehas", icon: "bi-person-fill", avatar: "bg-success", state: "Ongoing" },
  { name: "Coffee Company", icon: "bi-building", avatar: "bg-secondary", state: "Done" }
];

// Service photos and videos live in the "marketplace-images" bucket; this turns
// a stored public URL back into the file's path inside that bucket.
function storagePathFromUrl(url) {
  const marker = "/marketplace-images/";
  const index = url ? url.indexOf(marker) : -1;
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export default function ProjectsView() {
  const { openPreview, showToast, accountType, currentUserId } = useOutletContext();
  const isFreelancer = accountType === "freelancer";
  const [resumes] = useState(initialResumes);
  const [projects, setProjects] = useState(initialProjects);
  const [services, setServices] = useState(null);
  const [servicesError, setServicesError] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Only freelancers post services, so the "My Published Services" box loads for them alone.
  useEffect(() => {
    if (!isFreelancer || !currentUserId) return undefined;
    let active = true;

    supabase
      .from("services")
      .select("id, title, category, price, image_url, media_type, created_at")
      .eq("freelancer_id", currentUserId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setServicesError(true);
        else setServices(data);
      });

    return () => {
      active = false;
    };
  }, [isFreelancer, currentUserId]);

  const handleDelete = async () => {
    const service = serviceToDelete;
    setDeleting(true);

    // .select("id") returns the deleted rows, so an empty result means nothing was deleted.
    const { data, error } = await supabase.from("services").delete().eq("id", service.id).select("id");
    if (error || !data?.length) {
      setDeleting(false);
      showToast("Couldn't delete that service. Please try again.");
      return;
    }

    // The row is gone, so remove its photo or video from Storage too. If that
    // fails it only leaves an unused file behind, so it isn't treated as an error.
    const path = storagePathFromUrl(service.image_url);
    if (path) await supabase.storage.from("marketplace-images").remove([path]);

    setServices((prev) => prev.filter((s) => s.id !== service.id));
    setServiceToDelete(null);
    setDeleting(false);
    showToast(`"${service.title}" was deleted.`);
  };

  const toggleState = (name) => {
    setProjects((prev) => prev.map((p) => {
      if (p.name !== name) return p;
      const nextState = p.state === "Ongoing" ? "Done" : "Ongoing";
      showToast(nextState === "Done" ? "Project status updated to Done 🟢" : "Project status updated to Ongoing 🟡");
      return { ...p, state: nextState };
    }));
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        {isFreelancer && (
          <div className="col-12">
            <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-start gap-3 mb-4">
                <div>
                  <h4 className="text-white fw-bold mb-1"><i className="bi bi-grid-fill text-role me-2"></i> My Published Services</h4>
                  <p className="text-secondary fs-7 mb-0">Services you posted for clients to find.</p>
                </div>
                <Link to="/dashboard/services" className="btn btn-outline-role rounded-pill px-3 py-2 fs-7 fw-bold text-nowrap">
                  <i className="bi bi-plus-lg me-1"></i> Post a Service
                </Link>
              </div>

              {servicesError && <p className="text-danger fs-7 mb-0">Couldn't load your services right now.</p>}
              {!servicesError && services === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
              {!servicesError && services?.length === 0 && <p className="text-secondary fs-7 mb-0">You haven't posted a service yet.</p>}

              <div className="row g-3">
                {services?.map((s) => (
                  <div className="col-md-6 col-xl-4" key={s.id}>
                    <ServiceCard service={s} onDelete={setServiceToDelete} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="col-lg-6">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-file-earmark-person-fill text-info me-2"></i> Applications & Resumes</h4>
            <p className="text-secondary fs-7 mb-4">Candidates who submitted resumes for your listings.</p>

            <div className="d-flex flex-column gap-3">
              {resumes.map((r) => (
                <div key={r.name} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
                  <div className="d-flex align-items-center gap-3">
                    <div className={`avatar-circle ${r.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                      <i className={`bi ${r.icon} fs-4`}></i>
                    </div>
                    <div>
                      <h6 className="text-white fw-bold mb-0">{r.name}</h6>
                      <p className="text-warning fs-7 mb-0">Has sent a resume</p>
                    </div>
                  </div>
                  <button className="btn btn-secondary rounded-pill px-4 py-2 fw-bold text-white fs-7" onClick={() => openPreview("/images/Client.png", `${r.name} - Resume Preview`)}>View</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-kanban-fill text-warning me-2"></i> Active Projects Tracker</h4>
            <p className="text-secondary fs-7 mb-4">Track ongoing client contracts and project statuses.</p>

            <div className="d-flex flex-column gap-3">
              {projects.map((p) => (
                <div key={p.name} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
                  <div className="d-flex align-items-center gap-3">
                    <div className={`avatar-circle ${p.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                      <i className={`bi ${p.icon} fs-4`}></i>
                    </div>
                    <div>
                      <h6 className="text-white fw-bold mb-1">{p.name}</h6>
                      <div className="d-flex align-items-center gap-2 fs-7">
                        <span className="text-white-50">State: <strong className={p.state === "Ongoing" ? "text-warning" : "text-success"}>{p.state}</strong></span>
                        <i className={`bi bi-circle-fill fs-8 ${p.state === "Ongoing" ? "text-warning" : "text-success"}`}></i>
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-dark border border-secondary rounded-pill px-4 py-2 fw-bold text-white fs-7" onClick={() => toggleState(p.name)}>Toggle State</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        open={Boolean(serviceToDelete)}
        title="Delete this service?"
        message={serviceToDelete ? `"${serviceToDelete.title}" will be removed for good, together with its photo or video. This can't be undone.` : ""}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setServiceToDelete(null)}
      />
    </section>
  );
}
