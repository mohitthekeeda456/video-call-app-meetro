const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function getStoredToken() {
  return localStorage.getItem("token");
}

export async function api(path, options = {}) {
  const token = getStoredToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}
