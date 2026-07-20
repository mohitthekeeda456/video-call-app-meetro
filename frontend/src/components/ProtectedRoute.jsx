import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="rounded-lg border border-white/70 bg-white/85 px-6 py-5 text-sm font-semibold text-slate-600 shadow-xl shadow-slate-900/5">
          Checking your session...
        </div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
}
