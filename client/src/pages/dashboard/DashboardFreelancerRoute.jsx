import { useDashboardShell } from "./useDashboardShell";
import FreelancerDashboardLayout from "./FreelancerDashboardLayout";

// Route-level wrapper for /dashboard-freelancer -- resolves the shared
// shell state once (session, toast, preview, chat, sign-out) and hands it
// to FreelancerDashboardLayout, the same way DashboardLayout does for
// /dashboard.
export default function DashboardFreelancerRoute() {
  const shell = useDashboardShell();
  return <FreelancerDashboardLayout {...shell} />;
}
