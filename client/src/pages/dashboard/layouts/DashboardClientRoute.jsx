import { useDashboardShell } from "../hooks/useDashboardShell";
import ClientDashboardLayout from "./ClientDashboardLayout";
import { PageLoader } from "../../../components/Loaders";

// Route-level wrapper for /dashboard-client -- resolves the shared shell
// state once (session, toast, preview, chat, sign-out) and hands it to
// ClientDashboardLayout, the same way DashboardLayout does for /dashboard.
export default function DashboardClientRoute() {
  const shell = useDashboardShell();
  // The loading splash until the account is known (as on the other dashboard
  // pages, DashboardLayout.jsx); then its logo flies into the top bar. Coming
  // from another dashboard page skips it: the frame remembers the person.
  if (shell.accountType === null) {
    return <PageLoader />;
  }
  return <ClientDashboardLayout {...shell} />;
}
