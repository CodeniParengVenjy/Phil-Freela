import { Route, Routes } from "react-router-dom";
import Homepage from "./pages/Homepage";
import Login from "./pages/Login";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import ProfileView from "./pages/dashboard/views/ProfileView";
import MessagesView from "./pages/dashboard/views/MessagesView";
import InboxView from "./pages/dashboard/views/InboxView";
import ChatView from "./pages/dashboard/views/ChatView";
import NotificationsView from "./pages/dashboard/views/NotificationsView";
import ServicesView from "./pages/dashboard/views/ServicesView";
import ProjectsView from "./pages/dashboard/views/ProjectsView";
import SettingsView from "./pages/dashboard/views/SettingsView";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<ProfileView />} />
        <Route path="messages" element={<MessagesView />} />
        <Route path="inbox" element={<InboxView />} />
        <Route path="chat" element={<ChatView />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="services" element={<ServicesView />} />
        <Route path="projects" element={<ProjectsView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}

export default App;
