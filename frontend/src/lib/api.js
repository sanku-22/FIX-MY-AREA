import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });
export const buildPhotoUrl = (photoPath) => `${API}/files/${photoPath}`;

// ---- citizen phone auth ----
export async function phoneStart(phone, channel = "call") {
  const { data } = await api.post("/auth/phone/start", { phone, channel });
  return data;
}
export async function phoneVerify(phone, code) {
  const { data } = await api.post("/auth/phone/verify", { phone, code });
  return data;
}
export async function msg91Login(phone, access_token) {
  const { data } = await api.post("/auth/phone/msg91", { phone, access_token });
  return data;
}
export async function setProfile(name) {
  const { data } = await api.post("/auth/profile", { name });
  return data;
}
export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}
export async function logout() {
  await api.post("/auth/logout");
}

// ---- geocode ----
export async function reverseGeocode(lat, lng) {
  const { data } = await api.get("/geocode/reverse", { params: { lat, lng } });
  return data; // { address, state, district }
}
export async function searchGeocode(q) {
  const { data } = await api.get("/geocode/search", { params: { q } });
  return data; // [{ label, lat, lng }]
}

// ---- photos / issues ----
export async function uploadPhoto(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
  return data;
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
export async function confirmIssue(id) {
  const { data } = await api.post(`/issues/${id}/confirm`);
  return data;
}
export async function addComment(id, text) {
  const { data } = await api.post(`/issues/${id}/comments`, { text });
  return data;
}

// ---- admin auth ----
export async function adminLogin(email, password) {
  const { data } = await api.post("/admin/login", { email, password });
  return data;
}
export async function admin2fa(temp_token, code) {
  const { data } = await api.post("/admin/2fa/verify", { temp_token, code });
  return data;
}
export async function adminMe() {
  const { data } = await api.get("/admin/me");
  return data;
}
export async function adminLogout() {
  await api.post("/admin/logout");
}
export async function adminRegister(formData) {
  const { data } = await api.post("/admin/register", formData, { headers: { "Content-Type": "multipart/form-data" } });
  return data;
}
export async function fetchAdminRequests() {
  const { data } = await api.get("/admin/requests");
  return data;
}
export async function approveAdmin(id) {
  const { data } = await api.post(`/admin/requests/${id}/approve`);
  return data;
}
export async function rejectAdmin(id) {
  const { data } = await api.post(`/admin/requests/${id}/reject`);
  return data;
}
export async function fetchAdminIssues(params = {}) {
  const { data } = await api.get("/admin/issues", { params });
  return data;
}
export async function fetchAdminMetrics() {
  const { data } = await api.get("/admin/metrics");
  return data;
}
export async function adminUpdateStatus(id, status, note) {
  const { data } = await api.patch(`/admin/issues/${id}/status`, { status, note });
  return data;
}
export async function adminUpdateCategory(id, category) {
  const { data } = await api.patch(`/admin/issues/${id}/category`, { category });
  return data;
}
