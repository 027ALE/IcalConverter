// fetch-ical.js — GET /api/fetch-ical?url=...
//
// Proxy di download per link webcal/iCal. Richiede un utente autenticato
// con Netlify Identity (ruolo minimo "standard": qualunque utente Identity
// autenticato, indipendentemente dal ruolo).
//
// Il fetch verso l'URL fornito dall'utente passa sempre da safeFetch()
// (ssrf-guard.js), che blocca destinazioni interne/private (SSRF), segue
// i redirect rivalidandoli uno per uno e applica un limite alla
// dimensione del corpo scaricato.

import { requireRole, jsonResponse } from "./auth-utils.js";
import { safeFetch } from "./ssrf-guard.js";

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
    const { response: upstream, body } = await safeFetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; iCal-Downloader/1.0)" },
    });

    if (!upstream.ok) {
      return jsonResponse({ error: `Impossibile scaricare il calendario (HTTP ${upstream.status})` }, 502);
    }

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
  } catch (err) {
    console.error("fetch-ical:", err?.message || err);
    const message =
      err?.message === "L'URL punta a un indirizzo di rete non consentito." ||
      err?.message === "Impossibile risolvere l'host di destinazione." ||
      err?.message === "Il file scaricato supera la dimensione massima consentita." ||
      err?.message === "Troppi redirect durante il recupero del calendario."
        ? err.message
        : "Errore durante il recupero del calendario";
    return jsonResponse({ error: message }, 502);
  }
};

export const config = {
  path: "/api/fetch-ical",
};
