import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { SLIDES_SELECT } from "../../../lib/slides";
import { useServiceRatings } from "../../../lib/useServiceRatings";
import ServiceCard from "../components/ServiceCard";
import DeletePostDialog from "../components/DeletePostDialog";
import ApplicationsPanel from "../components/ApplicationsPanel";
import ProjectsPanel from "../components/ProjectsPanel";

export default function ProjectsView() {
  const { openChat, showToast, accountType, currentUserId } = useOutletContext();
  const isFreelancer = accountType === "freelancer";
  // Goes up by one after each hire, so My Projects reloads and shows it.
  const [hireCount, setHireCount] = useState(0);
  const [services, setServices] = useState(null);
  // What clients rated each of your offers, for the "★ 4.5 (2)" on its card.
  const ratings = useServiceRatings((services || []).map((s) => s.id));
  const [servicesError, setServicesError] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);

  // Only freelancers post services, so the "My Published Services" box loads for them alone.
  useEffect(() => {
    if (!isFreelancer || !currentUserId) return undefined;
    let active = true;

    supabase
      .from("services")
      .select(`id, title, category, price, image_url, media_type, created_at, updated_at, ${SLIDES_SELECT}`)
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
                    <ServiceCard service={s} editTo={`/dashboard/services?edit=${s.id}`} onDelete={setServiceToDelete} rating={ratings.get(s.id)} />
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

      <DeletePostDialog
        key={serviceToDelete?.id}
        kind="service"
        post={serviceToDelete}
        showToast={showToast}
        onCancel={() => setServiceToDelete(null)}
        onDeleted={(service) => {
          setServices((prev) => prev.filter((s) => s.id !== service.id));
          setServiceToDelete(null);
        }}
      />
    </section>
  );
}
