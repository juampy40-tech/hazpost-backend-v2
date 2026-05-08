const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export function resolveStorageObjectUrl(value?: string | null): string {
  if (!value) return "";

  const clean = value.trim();

  if (clean.startsWith("/storage/objects/")) {
    return `${BASE}/api/storage/objects/${clean.slice("/storage/objects/".length)}`;
  }

  if (clean.startsWith("storage/objects/")) {
    return `${BASE}/api/storage/objects/${clean.slice("storage/objects/".length)}`;
  }

  if (clean.startsWith("/objects/")) {
    return `${BASE}/api/storage/objects/${clean.slice("/objects/".length)}`;
  }

  if (clean.startsWith("objects/")) {
    return `${BASE}/api/storage/objects/${clean.slice("objects/".length)}`;
  }

  return clean;
}
