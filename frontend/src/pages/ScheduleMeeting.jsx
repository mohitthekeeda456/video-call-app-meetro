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

  const submit = async (event) => {
    event.preventDefault();
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
    <main className="flex-1 pb-12">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-normal text-cyan-700">Meeting setup</p>
        <h1 className="mt-1 text-3xl font-black text-slate-950">Schedule a meeting</h1>
      </div>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5" onSubmit={submit}>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Title
            <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" placeholder="Product sync, hiring call, class..." value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Date and time
              <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Duration
              <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" type="number" min="15" step="15" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Passcode
            <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" placeholder="Optional" value={form.passcode} onChange={(event) => setForm({ ...form, passcode: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Description
            <textarea className="min-h-32 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-normal outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" placeholder="Agenda, context, or notes for participants" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            Require host approval before participants enter
            <input className="h-5 w-5 accent-cyan-600" type="checkbox" checked={form.requireApproval} onChange={(event) => setForm({ ...form, requireApproval: event.target.checked })} />
          </label>
          <button className="rounded-md bg-slate-950 px-5 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create meeting"}
          </button>
          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        </form>

        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/10">
          <p className="text-xs font-black uppercase tracking-normal text-cyan-300">Room policy</p>
          <h2 className="mt-2 text-xl font-black">Host-first control</h2>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <div className="rounded-md bg-white/5 p-3">Waiting room can protect scheduled sessions.</div>
            <div className="rounded-md bg-white/5 p-3">Passcodes are checked before room access.</div>
            <div className="rounded-md bg-white/5 p-3">Hosts can lock, end, mute all, and remove participants.</div>
          </div>
        </aside>
      </section>

      {result ? (
        <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <h2 className="text-xl font-black">{result.title} is ready</h2>
          <p className="mt-2 break-all text-sm font-semibold">Room link: /meeting/{result.roomId}</p>
          <button className="mt-4 rounded-md bg-emerald-700 px-5 py-3 font-black text-white transition hover:bg-emerald-800" onClick={() => navigate(`/meeting/${result.roomId}`)}>
            Enter as host
          </button>
        </section>
      ) : null}
    </main>
  );
}
