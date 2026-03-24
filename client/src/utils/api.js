const API = "/api";

export async function fetchSessions(limit = 50, offset = 0) {
  const res = await fetch(`${API}/sessions?limit=${limit}&offset=${offset}`);
  return res.json();
}

export async function fetchSession(id) {
  const res = await fetch(`${API}/sessions/${id}`);
  return res.json();
}

export async function deleteSession(id) {
  return fetch(`${API}/sessions/${id}`, { method: "DELETE" });
}

export async function renameSession(id, title) {
  return fetch(`${API}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function setSpeakerAlias(sessionId, speaker, alias) {
  return fetch(`${API}/sessions/${sessionId}/speakers/${encodeURIComponent(speaker)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias }),
  });
}

export async function fetchSettings() {
  const res = await fetch(`${API}/settings`);
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${API}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function fetchDevices() {
  const res = await fetch(`${API}/devices`);
  return res.json();
}

export function getExportUrl(id) {
  return `${API}/sessions/${id}/export`;
}
