import React from "react";
import { Link, Route, Routes, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.jsx";
import { MeetingRoom } from "./pages/MeetingRoom.jsx";
import { ScheduleMeeting } from "./pages/ScheduleMeeting.jsx";
import { AuthPage } from "./pages/AuthPage.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { useAuth } from "./auth.jsx";

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <Link to="/" className="brand">Meetro</Link>
          <p className="subbrand">Schedule and host browser-native meetings with no paid SDKs.</p>
        </div>
        <nav className="navCluster">
          <Link to="/">Home</Link>
          {user ? <Link to="/schedule">Schedule</Link> : null}
          {user ? <span className="navUser">{user.name}</span> : <Link to="/auth">Sign in</Link>}
          {user ? <button className="ghostButton" onClick={logout}>Sign out</button> : null}
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/schedule" element={<ProtectedRoute><ScheduleMeeting /></ProtectedRoute>} />
        <Route path="/meeting/:roomId" element={<ProtectedRoute><MeetingRoom /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
