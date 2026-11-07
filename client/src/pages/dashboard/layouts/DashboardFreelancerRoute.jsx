import { useDashboardShell } from "../hooks/useDashboardShell";
import FreelancerDashboardLayout from "./FreelancerDashboardLayout";
import { PageLoader } from "../../../components/Loaders";

// Route-level wrapper for /dashboard-freelancer -- resolves the shared
// shell state once (session, toast, preview, chat, sign-out) and hands it
// to FreelancerDashboardLayout, the same way DashboardLayout does for
// /dashboard.
export default function DashboardFreelancerRoute() {
  const shell = useDashboardShell();
  // The loading splash until the account is known (as on the other dashboard
  // pages, DashboardLayout.jsx); then its logo flies into the top bar. Coming
  // from another dashboard page skips it: the frame remembers the person.
  if (shell.accountType === null) {
    return <PageLoader />;
  }
  return <FreelancerDashboardLayout {...shell} />;
}
