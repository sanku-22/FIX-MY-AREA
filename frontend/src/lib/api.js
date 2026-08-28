import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

export const buildPhotoUrl = (photoPath) => `${API}/files/${photoPath}`;

export async function uploadPhoto(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { photo_path?, relevant, reason, flagged_ai_generated }
}

export async function reverseGeocode(lat, lng) {
  const { data } = await api.get("/geocode/reverse", { params: { lat, lng } });
  return data.address;
}

export async function createIssue(payload) {
  const { data } = await api.post("/issues", payload);
  return data;
}

export async function fetchIssues(params = {}) {
  const { data } = await api.get("/issues", { params });
  return data;
}

export async function fetchIssue(id) {
  const { data } = await api.get(`/issues/${id}`);
  return data;
}

export async function confirmIssue(id, deviceId) {
  const { data } = await api.post(`/issues/${id}/confirm`, { device_id: deviceId });
  return data;
}

export async function addComment(id, payload) {
  const { data } = await api.post(`/issues/${id}/comments`, payload);
  return data;
}

export async function updateStatus(id, status, note) {
  const { data } = await api.patch(`/issues/${id}/status`, { status, note });
  return data;
}

export async function updateCategory(id, category) {
  const { data } = await api.patch(`/issues/${id}/category`, { category });
  return data;
}

export async function fetchMetrics() {
  const { data } = await api.get("/admin/metrics");
  return data;
}

// ---- auth ----
export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function postSession(sessionId) {
  const { data } = await api.post("/auth/session", {}, { headers: { "X-Session-ID": sessionId } });
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}
