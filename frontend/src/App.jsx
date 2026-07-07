import React from "react";
import { Link, Route, Routes, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.jsx";
import { MeetingRoom } from "./pages/MeetingRoom.jsx";
import { ScheduleMeeting } from "./pages/ScheduleMeeting.jsx";
import { AuthPage } from "./pages/AuthPage.jsx";

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">Meetro</Link>
        <nav>
          <Link to="/schedule">Schedule</Link>
          <Link to="/meeting/demo-room">Demo Room</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/schedule" element={<ScheduleMeeting />} />
        <Route path="/meeting/:roomId" element={<MeetingRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
