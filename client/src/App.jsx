import { Route, Routes } from "react-router-dom";
import Homepage from "./pages/homepage/Homepage";
import Login from "./pages/login/Login";
import ForgotPassword from "./pages/login/ForgotPassword";
import ResetPassword from "./pages/login/ResetPassword";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import DashboardFreelancerRoute from "./pages/dashboard/DashboardFreelancerRoute";
import DashboardClientRoute from "./pages/dashboard/DashboardClientRoute";
import FreelancerFYPView from "./pages/dashboard/views/FreelancerFYPView";
import ClientHomepageView from "./pages/dashboard/views/ClientHomepageView";
import ProfileView from "./pages/dashboard/views/ProfileView";
import MessagesView from "./pages/dashboard/views/MessagesView";
import InboxView from "./pages/dashboard/views/InboxView";
import ChatView from "./pages/dashboard/views/ChatView";
import NotificationsView from "./pages/dashboard/views/NotificationsView";
import ServicesView from "./pages/dashboard/views/ServicesView";
import PostNeedView from "./pages/dashboard/views/PostNeedView";
import ProjectsView from "./pages/dashboard/views/ProjectsView";
import SettingsView from "./pages/dashboard/views/SettingsView";
import FeedbackView from "./pages/dashboard/views/FeedbackView";
import JobDetailsView from "./pages/dashboard/views/JobDetailsView";
import ProjectDetailsView from "./pages/dashboard/views/ProjectDetailsView";
import SubmitProjectView from "./pages/dashboard/views/SubmitProjectView";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminSetup from "./pages/admin/AdminSetup";
import AdminDashboard from "./pages/admin/AdminDashboard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard-freelancer" element={<DashboardFreelancerRoute />}>
        <Route index element={<FreelancerFYPView />} />
      </Route>
      <Route path="/dashboard-client" element={<DashboardClientRoute />}>
        <Route index element={<ClientHomepageView />} />
      </Route>
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route path="profile" element={<ProfileView />} />
        <Route path="messages" element={<MessagesView />} />
        <Route path="inbox" element={<InboxView />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="chat/:conversationId" element={<ChatView />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="services" element={<ServicesView />} />
        <Route path="post-need" element={<PostNeedView />} />
        <Route path="projects" element={<ProjectsView />} />
        <Route path="settings" element={<SettingsView />} />
        <Route path="feedback" element={<FeedbackView />} />
        <Route path="job-details" element={<JobDetailsView />} />
        <Route path="project-details" element={<ProjectDetailsView />} />
        <Route path="submit-project" element={<SubmitProjectView />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/setup" element={<AdminSetup />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}

export default App;
