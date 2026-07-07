import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

export function Dashboard() {
  const [meetings, setMeetings] = useState([]);

  useEffect(() => {
    api("/api/meetings").then((data) => setMeetings(data.meetings || []));
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <h1>Meet, schedule, host, and manage calls without paid services.</h1>
        <p>Free WebRTC meetings with host controls, chat, and scheduling.</p>
        <div className="actions">
          <Link to="/schedule" className="button">Schedule meeting</Link>
          <Link to="/auth" className="button secondary">Sign in</Link>
        </div>
      </section>
      <section>
        <h2>Your meetings</h2>
        <div className="cards">
          {meetings.map((meeting) => (
            <article className="card" key={meeting._id}>
              <h3>{meeting.title}</h3>
              <p>Status: {meeting.status}</p>
              <Link to={`/meeting/${meeting.roomId}`}>Open room</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
