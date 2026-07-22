import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";

function formatDateTime(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MeetingHighlights() {
  const { roomId } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participantHistory, setParticipantHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHighlights() {
      try {
        const data = await api(`/api/meetings/room/${roomId}/highlights`);
        if (!active) return;
        setMeeting(data.meeting);
        setMessages(data.messages || []);
        setParticipantHistory(data.participantHistory || []);
        setEvents(data.events || []);
      } catch (nextError) {
        if (active) setError(nextError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHighlights();
    return () => {
      active = false;
    };
  }, [roomId]);

  if (loading) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="rounded-lg border border-white/70 bg-white/90 px-6 py-5 text-sm font-semibold text-slate-600 shadow-xl shadow-slate-900/5">
          Loading meeting highlights...
        </div>
      </main>
    );
  }

  if (error || !meeting) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-5 text-sm font-semibold text-red-700">
          {error || "Meeting highlights not found."}
        </div>
      </main>
    );
  }

  const scheduledEndAt = new Date(new Date(meeting.scheduledAt).getTime() + meeting.durationMinutes * 60 * 1000);

  return (
    <main className="flex-1 pb-12">
      <section className="rounded-lg border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-950/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black uppercase tracking-normal text-slate-600">{meeting.status}</span>
              <span className="rounded-md bg-cyan-100 px-2.5 py-1 text-xs font-black text-cyan-800">Highlights</span>
            </div>
            <h1 className="text-3xl font-black text-slate-950">{meeting.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{meeting.description || "No meeting description provided."}</p>
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Started {formatDateTime(meeting.scheduledAt)} | Planned for {meeting.durationMinutes} min | Ends around {scheduledEndAt.toLocaleTimeString()}
            </p>
          </div>
          <Link to="/" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            Back home
          </Link>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-slate-950">Chat history</h2>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{messages.length}</span>
          </div>
          <div className="grid max-h-[620px] gap-3 overflow-auto pr-1">
            {messages.map((message) => (
              <article className="rounded-md bg-slate-50 p-4" key={message._id || `${message.senderName}-${message.createdAt}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-slate-950">{message.senderName}</strong>
                  <time className="text-xs font-bold text-slate-400">{formatDateTime(message.createdAt)}</time>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{message.text}</p>
              </article>
            ))}
            {messages.length === 0 ? <p className="rounded-md bg-slate-50 p-4 text-sm font-semibold text-slate-500">No chat messages were sent in this meeting.</p> : null}
          </div>
        </div>

        <aside className="grid content-start gap-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-950">Participant history</h2>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{participantHistory.length}</span>
            </div>
            <div className="grid gap-3">
              {participantHistory.map((participant) => (
                <article className="rounded-md border border-slate-200 bg-slate-50 p-4" key={participant.userId || participant.email}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong className="block text-sm text-slate-950">{participant.name}</strong>
                      <span className="text-xs font-semibold text-slate-500">{participant.role}</span>
                    </div>
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-500">{participant.admitted ? "Admitted" : "Not admitted"}</span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                    <div className="flex justify-between gap-3">
                      <dt className="font-bold">Joined</dt>
                      <dd className="text-right">{formatDateTime(participant.joinedAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="font-bold">Left</dt>
                      <dd className="text-right">{formatDateTime(participant.leftAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-slate-950">Activity</h2>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{events.length}</span>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto pr-1">
              {events.slice().reverse().map((event, index) => (
                <article className="rounded-md bg-slate-50 p-3 text-sm" key={`${event.type}-${event.createdAt}-${index}`}>
                  <strong className="block text-slate-800">{event.type.replaceAll(".", " ")}</strong>
                  <span className="text-xs font-semibold text-slate-500">
                    {event.actorName || "System"} {event.targetName ? `-> ${event.targetName}` : ""} | {formatTime(event.createdAt)}
                  </span>
                </article>
              ))}
              {events.length === 0 ? <p className="text-sm font-semibold text-slate-500">No activity events recorded.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
