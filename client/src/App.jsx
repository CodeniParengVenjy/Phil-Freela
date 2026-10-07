import { Route, Routes } from "react-router-dom";
import Homepage from "./pages/homepage/Homepage";
import Login from "./pages/login/Login";
import ForgotPassword from "./pages/login/ForgotPassword";
import ResetPassword from "./pages/login/ResetPassword";
import CompleteProfile from "./pages/login/CompleteProfile";
import VerifyPhone from "./pages/verify-phone/VerifyPhone";
import AppealPage from "./pages/appeal/AppealPage";
import TermsOfService from "./pages/legal/TermsOfService";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import DashboardLayout from "./pages/dashboard/layouts/DashboardLayout";
import DashboardFreelancerRoute from "./pages/dashboard/layouts/DashboardFreelancerRoute";
import DashboardClientRoute from "./pages/dashboard/layouts/DashboardClientRoute";
import FreelancerFYPView from "./pages/dashboard/views/FreelancerFYPView";
import ClientHomepageView from "./pages/dashboard/views/ClientHomepageView";
import ProfileView from "./pages/dashboard/views/ProfileView";
import PublicProfileView from "./pages/dashboard/views/PublicProfileView";
import FindJobsView from "./pages/dashboard/views/FindJobsView";
import BrowseServicesView from "./pages/dashboard/views/BrowseServicesView";
import InboxView from "./pages/dashboard/views/InboxView";
import ChatView from "./pages/dashboard/views/ChatView";
import NotificationsView from "./pages/dashboard/views/NotificationsView";
import ServicesView from "./pages/dashboard/views/ServicesView";
import PostNeedView from "./pages/dashboard/views/PostNeedView";
import ProjectsView from "./pages/dashboard/views/ProjectsView";
import BookingsView from "./pages/dashboard/views/BookingsView";
import SettingsView from "./pages/dashboard/views/SettingsView";
import VerifyIdentityView from "./pages/dashboard/views/VerifyIdentityView";
import CheckOwnershipView from "./pages/dashboard/views/CheckOwnershipView";
import SearchResultsView from "./pages/dashboard/views/SearchResultsView";
import MoodboardMatchView from "./pages/dashboard/views/MoodboardMatchView";
import FeedbackView from "./pages/dashboard/views/FeedbackView";
import JobDetailsView from "./pages/dashboard/views/JobDetailsView";
import ProjectDetailsView from "./pages/dashboard/views/ProjectDetailsView";
import SubmitProjectView from "./pages/dashboard/views/SubmitProjectView";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminSetup from "./pages/admin/AdminSetup";
import AdminLayout from "./pages/admin/layout/AdminLayout";
import AdminOverviewView from "./pages/admin/views/AdminOverviewView";
import AdminUsersView from "./pages/admin/views/AdminUsersView";
import AdminAdminsView from "./pages/admin/views/AdminAdminsView";
import AdminLogView from "./pages/admin/views/AdminLogView";
import AdminListingsView from "./pages/admin/views/AdminListingsView";
import AdminReportsView from "./pages/admin/views/AdminReportsView";
import AdminFlaggedView from "./pages/admin/views/AdminFlaggedView";
import AdminAnnouncementsView from "./pages/admin/views/AdminAnnouncementsView";
import AdminApprovalsView from "./pages/admin/views/AdminApprovalsView";
import AdminBillboardView from "./pages/admin/views/AdminBillboardView";
import AdminVerificationsView from "./pages/admin/views/AdminVerificationsView";
import AdminAppealsView from "./pages/admin/views/AdminAppealsView";
import { usePageTitle } from "./lib/pageTitles";
import PageNotFound from "./components/PageNotFound";

function App() {
  // Sets the browser tab title for whichever page is open.
  usePageTitle();

  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* First Google sign-in (or any account without a profile yet) picks a username, gender and role here. */}
      <Route path="/complete-profile" element={<CompleteProfile />} />
      {/* Opened from the QR code on the phone; no login (the link's token is the key). */}
      <Route path="/verify-phone/:token" element={<VerifyPhone />} />
      {/* Suspended and banned users appeal here (banned users can't use anything else). */}
      <Route path="/appeal" element={<AppealPage />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/dashboard-freelancer" element={<DashboardFreelancerRoute />}>
        <Route index element={<FreelancerFYPView />} />
      </Route>
      <Route path="/dashboard-client" element={<DashboardClientRoute />}>
        <Route index element={<ClientHomepageView />} />
      </Route>
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route path="profile" element={<ProfileView />} />
        {/* One public profile page for everyone: both addresses open it, so a
            link to a person still works after they switch roles. */}
        <Route path="freelancers/:userId" element={<PublicProfileView />} />
        <Route path="clients/:userId" element={<PublicProfileView />} />
        <Route path="find-jobs" element={<FindJobsView />} />
        <Route path="inbox" element={<InboxView />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="chat/:conversationId" element={<ChatView />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="services" element={<ServicesView />} />
        <Route path="post-need" element={<PostNeedView />} />
        <Route path="projects" element={<ProjectsView />} />
        <Route path="bookings" element={<BookingsView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="verify-identity" element={<VerifyIdentityView />} />
        <Route path="check-ownership" element={<CheckOwnershipView />} />
        <Route path="search" element={<SearchResultsView />} />
        <Route path="moodboard-match" element={<MoodboardMatchView />} />
        <Route path="feedback/:projectId" element={<FeedbackView />} />
        <Route path="job-details/:jobId" element={<JobDetailsView />} />
        <Route path="project-details/:projectId" element={<ProjectDetailsView />} />
        <Route path="submit-project/:projectId" element={<SubmitProjectView />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/setup" element={<AdminSetup />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverviewView />} />
        <Route path="users" element={<AdminUsersView />} />
        <Route path="listings" element={<AdminListingsView />} />
        <Route path="reports" element={<AdminReportsView />} />
        <Route path="flagged" element={<AdminFlaggedView />} />
        <Route path="verifications" element={<AdminVerificationsView />} />
        <Route path="appeals" element={<AdminAppealsView />} />
        <Route path="approvals" element={<AdminApprovalsView />} />
        <Route path="announcements" element={<AdminAnnouncementsView />} />
        <Route path="billboard" element={<AdminBillboardView />} />
        <Route path="browse-services" element={<BrowseServicesView />} />
        <Route path="browse-jobs" element={<FindJobsView />} />
        <Route path="admins" element={<AdminAdminsView />} />
        <Route path="log" element={<AdminLogView />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
      {/* Any other address: usually an open tab that's older than the site
          (it reloads once to get the new version). */}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default App;
