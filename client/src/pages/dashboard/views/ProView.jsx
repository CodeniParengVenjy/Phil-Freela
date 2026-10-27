import { useOutletContext } from "react-router-dom";
import ProPlans from "../components/ProPlans";

// Premium (it was "Freelancer Pro"; PLAN-monetization.md, Step 5, and
// PLAN-premium.md): its own page at /dashboard/pro, for clients and
// freelancers (old links to the Settings tab come here). The plans, where the
// person stands and paying online are in ProPlans. Xendit sends the person
// back here after paying.
export default function ProView() {
  const { currentUserId, accountType, refreshPro } = useOutletContext();
  const isFreelancer = accountType === "freelancer";

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
        <div className="mx-auto" style={{ maxWidth: 940 }}>
          <h3 className="text-white fw-bold mb-1"><i className="bi bi-gem text-role me-2"></i>Premium</h3>
          <p className="text-secondary fs-7 mb-4">
            {isFreelancer
              ? "More offers, a free Featured post every month, view counts, bigger chat files, your own look and watermark, and a gold Premium badge."
              : "A free Featured job post every month, half-price Featured posts, view counts, bigger chat files, your own look, and a gold Premium badge."}
          </p>
          {currentUserId && accountType && <ProPlans userId={currentUserId} accountType={accountType} onPaid={refreshPro} />}
        </div>
      </div>
    </section>
  );
}
