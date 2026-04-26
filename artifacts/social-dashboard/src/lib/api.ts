// src/lib/api.ts

const BASE = import.meta.env.VITE_API_URL || "";

type Options = RequestInit & {
  json?: any;
};

export async function apiFetch(path: string, options: Options = {}) {
  const { json, headers, ...rest } = options;

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include", // 🔥 CRÍTICO (LOGIN)
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    ...(json ? { body: JSON.stringify(json) } : {}),
    ...rest,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "API error");
  }

  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}
