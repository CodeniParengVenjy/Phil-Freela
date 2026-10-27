import { useOutletContext } from "react-router-dom";
import ProPlans from "../components/ProPlans";

// Freelancer Pro (PLAN-monetization.md, Step 5): its own page in the
// freelancer's menu, at /dashboard/pro (it used to be a Settings tab; old links
// to that tab come here). The plans, where the person stands and paying online
// are in ProPlans. Xendit sends the person back here after paying.
export default function ProView() {
  const { currentUserId, accountType, refreshPro } = useOutletContext();

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
        <div className="mx-auto" style={{ maxWidth: 940 }}>
          <h3 className="text-white fw-bold mb-1"><i className="bi bi-gem text-role me-2"></i>Freelancer Pro</h3>
          <p className="text-secondary fs-7 mb-4">More offers, a gold Pro badge by your name, and half-price Featured posts.</p>
          {accountType === "freelancer" && currentUserId ? (
            <ProPlans userId={currentUserId} onPaid={refreshPro} />
          ) : (
            <p className="text-secondary fs-7 mb-0">Freelancer Pro is for freelancer accounts. Switch to your freelancer account to see it.</p>
          )}
        </div>
      </div>
    </section>
  );
}
