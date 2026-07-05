// fetch-ical.js — GET /api/fetch-ical?url=...
//
// Proxy di download per link webcal/iCal. Richiede un utente autenticato e
// autorizzato con ruolo almeno "standard" (cioè: qualunque utente invitato
// dall'amministratore).

import { requireRole, jsonResponse } from "./auth-utils.js";

export default async (req, context) => {
  const auth = await requireRole(req, context, "standard");
  if (auth.error) return auth.error;

  const url = new URL(req.url).searchParams.get("url");

  if (!url) {
    return jsonResponse({ error: "Parametro 'url' mancante" }, 400);
  }

  let target;
  try {
    target = new URL(url.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return jsonResponse({ error: "URL non valido" }, 400);
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return jsonResponse({ error: "Protocollo non supportato" }, 400);
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; iCal-Downloader/1.0)" },
    });

    if (!upstream.ok) {
      return jsonResponse({ error: `Impossibile scaricare il calendario (HTTP ${upstream.status})` }, 502);
    }

    const body = await upstream.text();

    if (!body.includes("BEGIN:VCALENDAR")) {
      return jsonResponse({ error: "Il contenuto scaricato non sembra un file iCal valido" }, 502);
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendario.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return jsonResponse({ error: "Errore durante il recupero del calendario" }, 500);
  }
};

export const config = {
  path: "/api/fetch-ical",
};
