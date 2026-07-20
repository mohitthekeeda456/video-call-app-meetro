import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export function Dashboard() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState("");
  const [joinRoomValue, setJoinRoomValue] = useState("");
  const [joinPasscode, setJoinPasscode] = useState("");
  const [copiedMeetingId, setCopiedMeetingId] = useState("");

  function normalizeRoomId(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
      const maybeUrl = new URL(trimmed);
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      return segments[segments.length - 1] || "";
    } catch {
      return trimmed.split("/").filter(Boolean).pop() || "";
    }
  }

  function submitJoin(event) {
    event.preventDefault();
    const roomId = normalizeRoomId(joinRoomValue);
    if (!roomId) {
      setError("Enter a meeting link or room ID to join.");
      return;
    }

    setError("");
    const query = joinPasscode ? `?passcode=${encodeURIComponent(joinPasscode)}` : "";
    navigate(`/meeting/${roomId}${query}`);
  }

  async function copyInvite(meeting) {
    const inviteUrl = `${window.location.origin}/meeting/${meeting.roomId}`;
    const inviteText = meeting.hasPasscode ? `${inviteUrl}\nPasscode: ${meeting.passcodeHint || "Use the host-shared passcode"}` : inviteUrl;
    await navigator.clipboard.writeText(inviteText);
    setCopiedMeetingId(meeting.id);
    window.setTimeout(() => setCopiedMeetingId(""), 1800);
  }

  useEffect(() => {
    if (!user) {
      setMeetings([]);
      setError("");
      return;
    }

    api("/api/meetings")
      .then((data) => {
        setMeetings(data.meetings || []);
        setError("");
      })
      .catch((nextError) => setError(nextError.message));
  }, [user]);

  const upcomingMeetings = meetings.filter((meeting) => meeting.status !== "ended");
  const liveMeetings = meetings.filter((meeting) => meeting.status === "live");

  return (
    <main className="flex-1 pb-12">
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-cyan-400/15 px-3 py-1 text-xs font-black uppercase tracking-normal text-cyan-200">Self-hosted meetings</span>
            <span className="rounded-md bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">WebRTC + Socket.io</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
            {user ? `Ready when you are, ${user.name.split(" ")[0]}.` : "Run meetings from your own stack."}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Schedule rooms, paste meeting links, admit participants, and control live calls without paid meeting APIs.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {user ? <Link to="/schedule" className="rounded-md bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300">Schedule meeting</Link> : <Link to="/auth" className="rounded-md bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300">Create account</Link>}
            {user ? null : <Link to="/auth" className="rounded-md border border-white/15 px-5 py-3 font-bold text-white transition hover:bg-white/10">Sign in</Link>}
          </div>

          {user ? (
            <form className="mt-6 grid gap-3 rounded-lg border border-white/10 bg-white/5 p-3 sm:grid-cols-[1.4fr_0.8fr_auto]" onSubmit={submitJoin}>
              <input className="rounded-md border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-4 focus:ring-cyan-300/30" value={joinRoomValue} placeholder="Paste meeting link or enter room ID" onChange={(event) => setJoinRoomValue(event.target.value)} />
              <input className="rounded-md border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-4 focus:ring-cyan-300/30" value={joinPasscode} placeholder="Passcode if needed" onChange={(event) => setJoinPasscode(event.target.value)} />
              <button className="rounded-md bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-100" type="submit">Join</button>
            </form>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <StatCard label="Total meetings" value={meetings.length} />
          <StatCard label="Upcoming or live" value={upcomingMeetings.length} />
          <StatCard label="Live right now" value={liveMeetings.length} />
          <StatCard label="Session" value={user ? "Ready" : ready ? "Guest" : "..."} />
        </div>
      </section>

      {error ? <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {user ? (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-normal text-cyan-700">Your rooms</p>
              <h2 className="text-2xl font-black text-slate-950">Meeting history</h2>
            </div>
            <Link to="/schedule" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">Create another</Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {meetings.map((meeting) => (
              <article className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-cyan-200 hover:shadow-xl hover:shadow-cyan-950/10" key={meeting.id}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-normal text-slate-600">{meeting.status}</span>
                  <span className="text-xs font-semibold text-slate-400">{meeting.durationMinutes} min</span>
                </div>
                <h3 className="line-clamp-2 text-lg font-black text-slate-950">{meeting.title}</h3>
                <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{meeting.description || "No description yet."}</p>
                <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{new Date(meeting.scheduledAt).toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/meeting/${meeting.roomId}`} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-700">Open room</Link>
                  <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50" onClick={() => copyInvite(meeting)}>
                    {copiedMeetingId === meeting.id ? "Copied" : "Copy invite"}
                  </button>
                </div>
              </article>
            ))}
            {meetings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">
                No meetings yet. Schedule your first one to start testing the full flow.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-950/5 transition hover:-translate-y-0.5 hover:shadow-xl">
      <strong className="block truncate text-2xl font-black text-slate-950">{value}</strong>
      <span className="mt-1 block text-sm font-semibold text-slate-500">{label}</span>
    </div>
  );
}
