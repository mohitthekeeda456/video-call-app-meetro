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

  return (
    <main className="page">
      <section className="hero heroGrid">
        <div>
          <p className="eyebrow">Full-stack and self-owned</p>
          <h1>Schedule, host, admit, moderate, and join meetings from your own stack.</h1>
          <p>React on the front, Express and MongoDB on the back, Socket.io signaling, and WebRTC media in the browser.</p>
          <div className="actions">
            {user ? <Link to="/schedule" className="button">Schedule meeting</Link> : <Link to="/auth" className="button">Create account</Link>}
            {user ? null : <Link to="/auth" className="button secondary">Sign in</Link>}
          </div>
          {user ? (
            <form className="joinInlineForm" onSubmit={submitJoin}>
              <input
                value={joinRoomValue}
                placeholder="Paste meeting link or enter room ID"
                onChange={(event) => setJoinRoomValue(event.target.value)}
              />
              <input
                value={joinPasscode}
                placeholder="Passcode if needed"
                onChange={(event) => setJoinPasscode(event.target.value)}
              />
              <button className="button secondary" type="submit">Join meeting</button>
            </form>
          ) : null}
        </div>
        <div className="statsGrid">
          <div className="statCard"><strong>{meetings.length}</strong><span>Total meetings</span></div>
          <div className="statCard"><strong>{upcomingMeetings.length}</strong><span>Upcoming or live</span></div>
          <div className="statCard"><strong>{user ? "Ready" : ready ? "Guest" : "..."}</strong><span>Session state</span></div>
        </div>
      </section>

      {user ? (
        <section className="sectionSpace">
          <div className="sectionHeader">
            <h2>Your meetings</h2>
            <Link to="/schedule" className="textLink">Create another</Link>
          </div>
          {error ? <div className="panel errorText">{error}</div> : null}
          <div className="cards">
            {meetings.map((meeting) => (
              <article className="card" key={meeting.id}>
                <p className="eyebrow">{meeting.status}</p>
                <h3>{meeting.title}</h3>
                <p>{meeting.description || "No description yet."}</p>
                <p>{new Date(meeting.scheduledAt).toLocaleString()}</p>
                <div className="actions">
                  <Link to={`/meeting/${meeting.roomId}`} className="button secondary">Open room</Link>
                </div>
              </article>
            ))}
            {meetings.length === 0 ? <div className="panel">No meetings yet. Schedule your first one to start testing the full flow.</div> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
