import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export function ScheduleMeeting() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    scheduledAt: "",
    durationMinutes: 30,
    description: "",
    passcode: "",
    requireApproval: true
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/meetings", { method: "POST", body: JSON.stringify(form) });
      setResult(data.meeting);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Meeting setup</p>
          <h1>Schedule a meeting</h1>
        </div>
      </section>
      <form className="form wideForm" onSubmit={submit}>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
        <input type="number" min="15" step="15" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
        <input placeholder="Passcode (optional)" value={form.passcode} onChange={(e) => setForm({ ...form, passcode: e.target.value })} />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label className="toggleRow">
          <input type="checkbox" checked={form.requireApproval} onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })} />
          <span>Require host approval before participants enter</span>
        </label>
        <button className="button" type="submit" disabled={busy}>{busy ? "Creating..." : "Create meeting"}</button>
        {error ? <p className="errorText">{error}</p> : null}
      </form>
      {result ? (
        <section className="panel successPanel">
          <h2>{result.title} is ready</h2>
          <p>Room link: `/meeting/{result.roomId}`</p>
          <div className="actions">
            <button className="button" onClick={() => navigate(`/meeting/${result.roomId}`)}>Enter as host</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
