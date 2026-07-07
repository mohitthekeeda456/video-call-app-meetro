import React, { useState } from "react";
import { api } from "../api.js";

export function AuthPage() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const data = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
    if (data.token) localStorage.setItem("token", data.token);
    setMessage(data.error || `Signed ${mode}`);
  };

  return (
    <main className="page">
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      <form className="form" onSubmit={submit}>
        {mode === "register" ? <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /> : null}
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="button" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="linkbutton" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        Switch to {mode === "login" ? "register" : "login"}
      </button>
      {message ? <p>{message}</p> : null}
    </main>
  );
}
