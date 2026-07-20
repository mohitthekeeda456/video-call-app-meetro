import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { applyAuth, user } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(location.state?.from || "/", { replace: true });
    }
  }, [location.state, navigate, user]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const data = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      applyAuth(data);
      navigate(location.state?.from || "/", { replace: true });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid flex-1 place-items-center py-8">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-white/70 bg-white shadow-2xl shadow-slate-950/10 md:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-[420px] flex-col justify-between bg-slate-950 p-8 text-white">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-cyan-300">Meetro access</p>
            <h1 className="mt-4 max-w-md text-4xl font-black leading-tight">
              {mode === "login" ? "Welcome back to your meeting desk." : "Create your host account."}
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
              Keep meetings, auth, chat, and moderation inside your own app without a paid video SDK.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border border-white/10 bg-white/5 p-3">JWT sessions</div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">MongoDB data</div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">WebRTC calls</div>
          </div>
        </div>

        <form className="grid gap-4 p-6 sm:p-8" onSubmit={submit}>
          <div>
            <h2 className="text-2xl font-black text-slate-950">{mode === "login" ? "Sign in" : "Register"}</h2>
            <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "Use your existing Meetro account." : "Start with a name, email, and password."}</p>
          </div>

          {mode === "register" ? (
            <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          ) : null}
          <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100" type="password" placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />

          <button className="rounded-md bg-slate-950 px-5 py-3 font-black text-white transition hover:-translate-y-0.5 hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={busy}>
            {busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button className="rounded-md border border-slate-200 px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            Switch to {mode === "login" ? "register" : "login"}
          </button>
          {message ? <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}
