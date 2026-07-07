import React, { useState } from "react";
import { api } from "../api.js";

export function ScheduleMeeting() {
  const [form, setForm] = useState({ title: "", scheduledAt: "", durationMinutes: 30, description: "", passcode: "" });
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const data = await api("/api/meetings", { method: "POST", body: JSON.stringify(form) });
    setResult(data.meeting);
  };

  return (
    <main className="page">
      <h1>Schedule a meeting</h1>
      <form className="form" onSubmit={submit}>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
        <input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
        <input placeholder="Passcode" value={form.passcode} onChange={(e) => setForm({ ...form, passcode: e.target.value })} />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="button" type="submit">Create</button>
      </form>
      {result ? <p>Created room: {result.roomId}</p> : null}
    </main>
  );
}
