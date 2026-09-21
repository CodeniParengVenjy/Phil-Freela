import { useDashboardShell } from "./useDashboardShell";
import ClientDashboardLayout from "./ClientDashboardLayout";

// Route-level wrapper for /dashboard-client -- resolves the shared shell
// state once (session, toast, preview, chat, sign-out) and hands it to
// ClientDashboardLayout, the same way DashboardLayout does for /dashboard.
export default function DashboardClientRoute() {
  const shell = useDashboardShell();
  return <ClientDashboardLayout {...shell} />;
}
