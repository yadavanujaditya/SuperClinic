const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

async function req(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const saveSummaryRecord = (payload) => req("/api/records/summaries", { method: "POST", body: JSON.stringify(payload) }).catch(() => null);
export const listMySummaries = () => req("/api/records/summaries/mine");
export const deleteSummaryRecord = (id) => req(`/api/records/summaries/${id}`, { method: "DELETE" });

export const saveCaseRecord = (payload) => req("/api/records/cases", { method: "POST", body: JSON.stringify(payload) }).catch(() => null);
export const listMyCases = () => req("/api/records/cases/mine");
export const deleteCaseRecord = (id) => req(`/api/records/cases/${id}`, { method: "DELETE" });

export const submitRating = (payload) => req("/api/records/ratings", { method: "POST", body: JSON.stringify(payload) }).catch(() => null);

export const adminListSummaries = () => req("/api/records/admin/summaries");
export const adminListCases = () => req("/api/records/admin/cases");
export const adminListRatings = () => req("/api/records/admin/ratings");
export const adminListUsers = () => req("/api/records/admin/users");
