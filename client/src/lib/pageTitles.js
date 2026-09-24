import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// The browser tab title for each page. It shows as "PhilFreela - <title>".
// A page that is not listed here just shows "PhilFreela".
const pageTitles = {
  "/login": "Sign In & Register",
  "/forgot-password": "Forgot Password",
  "/reset-password": "Reset Password",

  "/dashboard-freelancer": "Dashboard",
  "/dashboard-client": "Dashboard",
  "/dashboard/profile": "Profile",
  "/dashboard/find-jobs": "Find Jobs",
  "/dashboard/inbox": "Inbox",
  "/dashboard/chat": "Chat",
  "/dashboard/notifications": "Notifications",
  "/dashboard/services": "My Services",
  "/dashboard/post-need": "Post a Project",
  "/dashboard/projects": "Projects & Resumes",
  "/dashboard/settings": "Settings",
  "/dashboard/verify-identity": "Verify Identity",
  "/dashboard/feedback": "Ratings and Feedback",
  "/dashboard/job-details": "Job Details",
  "/dashboard/project-details": "Project Details",
  "/dashboard/submit-project": "Submit Project",

  "/admin/login": "Admin Sign In",
  "/admin/setup": "Admin Setup",
  "/admin": "Admin Overview",
  "/admin/users": "Monitor Users",
  "/admin/listings": "Monitor Listings",
  "/admin/reports": "Monitor Reports",
  "/admin/admins": "Monitor Accounts",
  "/admin/browse-services": "Monitor Browse Services",
  "/admin/browse-jobs": "Monitor Browse Jobs"
};

// Finds the title for a path. Chat links end with a conversation id
// (/dashboard/chat/123), so they are matched by how they start.
function getPageTitle(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/dashboard/chat/")) return pageTitles["/dashboard/chat"];
  return pageTitles[path];
}

// Updates the browser tab title every time the user moves to another page.
export function usePageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const title = getPageTitle(pathname);
    document.title = title ? `PhilFreela - ${title}` : "PhilFreela";
  }, [pathname]);
}
