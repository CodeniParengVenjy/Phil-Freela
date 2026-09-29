import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { SLIDES_SELECT, removeItemFiles } from "../../../lib/slides";
import ServiceCard from "../components/ServiceCard";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import ApplicationsPanel from "../components/ApplicationsPanel";
import ProjectsPanel from "../components/ProjectsPanel";

export default function ProjectsView() {
  const { openChat, showToast, accountType, currentUserId } = useOutletContext();
  const isFreelancer = accountType === "freelancer";
  // Goes up by one after each hire, so My Projects reloads and shows it.
  const [hireCount, setHireCount] = useState(0);
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
      .select(`id, title, category, price, image_url, media_type, created_at, ${SLIDES_SELECT}`)
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

    // The row is gone, so remove its photos and videos from Storage too. If
    // that fails it only leaves unused files behind, so it isn't treated as an error.
    await removeItemFiles(service);

    setServices((prev) => prev.filter((s) => s.id !== service.id));
    setServiceToDelete(null);
    setDeleting(false);
    showToast(`"${service.title}" was deleted.`);
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
          {/* Real applications (lib/applications.js): applicants for clients, My Applications for freelancers. */}
          <ApplicationsPanel
            isFreelancer={isFreelancer}
            currentUserId={currentUserId}
            openChat={openChat}
            showToast={showToast}
            onHired={() => setHireCount((n) => n + 1)}
          />
        </div>

        <div className="col-lg-6">
          {/* Real projects (lib/projects.js): each card opens its Project Details page. */}
          <ProjectsPanel isFreelancer={isFreelancer} currentUserId={currentUserId} reloadKey={hireCount} />
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
