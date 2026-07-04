import { getStore } from "@netlify/blobs";
import { getAuthenticatedUser, getUserEmail, isAdminUser, isAllowedUser, jsonResponse } from "./auth-utils.js";

const STORE_NAME = "webcal-links";
const KEY = "links.json";

function getStoreInstance() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function readLinks(store) {
  try {
    const data = await store.get(KEY, { type: "json" });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeLinks(store, links) {
  await store.setJSON(KEY, links);
}

function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const target = new URL(trimmed.replace(/^webcal:\/\//i, "https://"));
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return trimmed;
}

function normalizeLabel(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 120);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default async (req) => {
  const user = await getAuthenticatedUser(req);
  if (!user || !getUserEmail(user) || !isAllowedUser(user)) {
    return jsonResponse({ error: "Autenticazione richiesta." }, 401);
  }

  const store = getStoreInstance();
  const method = req.method;

  if (method === "GET") {
    const links = await readLinks(store);
    return jsonResponse({ links });
  }

  if (method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const url = normalizeUrl(body.url);
    if (!url) {
      return jsonResponse({ error: "URL non valido." }, 400);
    }

    const label = normalizeLabel(body.label);
    const links = await readLinks(store);

    if (links.some((l) => l.url === url)) {
      return jsonResponse({ error: "Questo link e' gia' stato salvato." }, 409);
    }

    const newLink = {
      id: crypto.randomUUID(),
      url,
      label,
      savedAt: Date.now(),
    };

    links.push(newLink);
    await writeLinks(store, links);
    return jsonResponse({ links });
  }

  if (method === "PUT") {
    if (!isAdminUser(user)) {
      return jsonResponse({ error: "Solo gli amministratori possono modificare i link." }, 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const { id } = body;
    if (!id || typeof id !== "string") {
      return jsonResponse({ error: "ID mancante." }, 400);
    }

    const url = normalizeUrl(body.url);
    if (!url) {
      return jsonResponse({ error: "URL non valido." }, 400);
    }

    const label = normalizeLabel(body.label);
    const links = await readLinks(store);
    const idx = links.findIndex((l) => l.id === id);

    if (idx === -1) {
      return jsonResponse({ error: "Link non trovato." }, 404);
    }

    links[idx] = { ...links[idx], url, label };
    await writeLinks(store, links);
    return jsonResponse({ links });
  }

  if (method === "DELETE") {
    if (!isAdminUser(user)) {
      return jsonResponse({ error: "Solo gli amministratori possono eliminare i link." }, 403);
    }

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return jsonResponse({ error: "ID mancante." }, 400);
    }

    const links = await readLinks(store);
    const filtered = links.filter((l) => l.id !== id);

    if (filtered.length === links.length) {
      return jsonResponse({ error: "Link non trovato." }, 404);
    }

    await writeLinks(store, filtered);
    return jsonResponse({ links: filtered });
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = {
  path: "/api/links",
};
