const API_ROOT = "/api";

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers,
      credentials: "include",
      body: options.body && !isForm && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
    });
  } catch {
    throw new Error("Could not reach the server. Check that the backend is running and try again.");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message = typeof data === "string"
      ? data || `Request failed (${response.status})`
      : data.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: "POST", body });
export const put = (path, body) => api(path, { method: "PUT", body });
export const patch = (path, body) => api(path, { method: "PATCH", body });
export const del = (path) => api(path, { method: "DELETE" });
export const queryString = (values) => new URLSearchParams(values).toString();
