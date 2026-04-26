// src/lib/api.ts

const API_BASE = "";

export async function apiFetch(
  path: string,
  options: RequestInit & { json?: any } = {}
) {
  const { json, headers, ...rest } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    ...(json ? { body: JSON.stringify(json) } : {}),
    ...rest,
  });

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {}

    throw new Error(errorText || "Error en API");
  }

  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}
