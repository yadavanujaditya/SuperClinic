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

export const publishTemplate = (payload) => req("/api/community/templates/publish", { method: "POST", body: JSON.stringify(payload) });
export const listCommunityTemplates = () => req("/api/community/templates");
export const unpublishTemplate = (id) => req(`/api/community/templates/${id}`, { method: "DELETE" });
export const rateTemplate = (id, stars) => req(`/api/community/templates/${id}/rate`, { method: "POST", body: JSON.stringify({ stars }) });

export const publishWorkflow = (payload) => req("/api/community/workflows/publish", { method: "POST", body: JSON.stringify(payload) });
export const listCommunityWorkflows = () => req("/api/community/workflows");
export const unpublishWorkflow = (id) => req(`/api/community/workflows/${id}`, { method: "DELETE" });
export const rateWorkflow = (id, stars) => req(`/api/community/workflows/${id}/rate`, { method: "POST", body: JSON.stringify({ stars }) });
