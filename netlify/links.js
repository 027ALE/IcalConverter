import { getStore } from "@netlify/blobs";
import { getSession, requireRole, jsonResponse } from "./auth-utils.js";

const STORE_NAME = "webcal-links";
const KEY = "links.json";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

async function readLinks() {
  try {
    const data = await store().get(KEY, { type: "json" });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeLinks(links) {
  await store().setJSON(KEY, links);
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
  return typeof raw === "string" ? raw.trim().slice(0, 120) : "";
}

export default async (req) => {
  const session = await getSession(req);
  if (!session) return jsonResponse({ error: "Autenticazione richiesta." }, 401);

  const method = req.method;

  if (method === "GET") {
    return jsonResponse({ links: await readLinks() });
  }

  if (method === "POST" || method === "PUT") {
    if (!requireRole(session, ["admin", "intermediate"])) {
      return jsonResponse({ error: "Permesso insufficiente per modificare i link." }, 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const url = normalizeUrl(body.url);
    if (!url) return jsonResponse({ error: "URL non valido." }, 400);
    const label = normalizeLabel(body.label);
    const links = await readLinks();

    if (method === "POST") {
      if (links.some((l) => l.url === url)) {
        return jsonResponse({ error: "Questo link è già stato salvato." }, 409);
      }
      links.push({ id: crypto.randomUUID(), url, label, savedAt: Date.now() });
      await writeLinks(links);
      return jsonResponse({ links });
    }

    const { id } = body;
    const idx = links.findIndex((l) => l.id === id);
    if (idx === -1) return jsonResponse({ error: "Link non trovato." }, 404);
    links[idx] = { ...links[idx], url, label };
    await writeLinks(links);
    return jsonResponse({ links });
  }

  if (method === "DELETE") {
    if (!requireRole(session, ["admin"])) {
      return jsonResponse({ error: "Solo l'amministratore può eliminare i link." }, 403);
    }
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonResponse({ error: "ID mancante." }, 400);
    const links = await readLinks();
    const filtered = links.filter((l) => l.id !== id);
    if (filtered.length === links.length) return jsonResponse({ error: "Link non trovato." }, 404);
    await writeLinks(filtered);
    return jsonResponse({ links: filtered });
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = { path: "/api/links" };
