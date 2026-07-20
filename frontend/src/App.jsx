import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./pages/AuthPage.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { MeetingRoom } from "./pages/MeetingRoom.jsx";
import { ScheduleMeeting } from "./pages/ScheduleMeeting.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { useAuth } from "./auth.jsx";

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="fixed inset-x-0 top-0 z-[-1] h-72 bg-[linear-gradient(135deg,#09111f_0%,#0f766e_48%,#38bdf8_100%)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-40 mb-6 flex flex-col gap-4 rounded-lg border border-white/60 bg-white/85 px-4 py-3 shadow-xl shadow-slate-900/5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/meetro-logo.png" alt="Meetro logo" className="h-12 w-12 rounded-md object-cover shadow-md shadow-cyan-900/10" />
            <div className="min-w-0">
              <span className="block text-xl font-black uppercase tracking-normal text-slate-950">Meetro</span>
              <p className="truncate text-sm text-slate-500">Connect and collaborate from your own stack.</p>
            </div>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            <Link className="rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950" to="/">Home</Link>
            {user ? <Link className="rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950" to="/schedule">Schedule</Link> : null}
            {user ? (
              <span className="rounded-md bg-slate-100 px-3 py-2 text-slate-800">{user.name}</span>
            ) : (
              <Link className="rounded-md bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800" to="/auth">Sign in</Link>
            )}
            {user ? (
              <button className="rounded-md border border-slate-200 px-3 py-2 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700" onClick={logout}>
                Sign out
              </button>
            ) : null}
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
    </div>
  );
}
