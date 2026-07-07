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
    <main className="page">
      <section className="authLayout">
        <div className="panel authIntro">
          <p className="eyebrow">Browser-native meetings</p>
          <h1>{mode === "login" ? "Sign in to your control desk" : "Create your host account"}</h1>
          <p>We keep auth simple for now: email, password, and JWT sessions tied to your own backend.</p>
        </div>
        <form className="form authCard" onSubmit={submit}>
          {mode === "register" ? <input placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /> : null}
          <input placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <input type="password" placeholder="Password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <button className="button" type="submit" disabled={busy}>{busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}</button>
          <button className="linkbutton" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            Switch to {mode === "login" ? "register" : "login"}
          </button>
          {message ? <p className="errorText">{message}</p> : null}
        </form>
      </section>
    </main>
  );
}
