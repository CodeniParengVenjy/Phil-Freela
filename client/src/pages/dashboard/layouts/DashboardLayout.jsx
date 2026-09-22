import { useDashboardShell } from "../hooks/useDashboardShell";
import FreelancerDashboardLayout from "./FreelancerDashboardLayout";
import ClientDashboardLayout from "./ClientDashboardLayout";

// Freelancers and clients get their own dedicated dashboard shell (nav,
// sidebar, welcome banner) instead of one shell branching on role
// everywhere. This component resolves the signed-in session once (via
// useDashboardShell) and hands that shared state down as props to
// whichever role-specific layout should render.
export default function DashboardLayout() {
  const shell = useDashboardShell();

  // accountType is null until the session finishes loading. Rendering
  // nothing for that instant (instead of guessing a role) is what stops the
  // wrong dashboard from flashing on screen before the real one appears.
  if (shell.accountType === null) {
    return <div className="bg-dark min-vh-100" />;
  }

  return shell.accountType === "freelancer"
    ? <FreelancerDashboardLayout {...shell} />
    : <ClientDashboardLayout {...shell} />;
}
