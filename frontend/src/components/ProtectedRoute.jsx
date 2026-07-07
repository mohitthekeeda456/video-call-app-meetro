import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export function ProtectedRoute({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <main className="page"><div className="panel">Checking your session...</div></main>;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
}
