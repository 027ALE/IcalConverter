import { getAuthenticatedUser, getUserEmail, isAllowedUser, jsonResponse } from "./auth-utils.js";

export default async (req) => {
  const user = await getAuthenticatedUser(req);
  if (!user || !getUserEmail(user) || !isAllowedUser(user)) {
    return jsonResponse({ error: "Autenticazione richiesta." }, 401);
  }

  const url = new URL(req.url).searchParams.get("url");

  if (!url) {
    return new Response(JSON.stringify({ error: "Parametro 'url' mancante" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let target;
  try {
    target = new URL(url.replace(/^webcal:\/\//i, "https://"));
  } catch {
    return new Response(JSON.stringify({ error: "URL non valido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new Response(JSON.stringify({ error: "Protocollo non supportato" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; iCal-Downloader/1.0)" },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Impossibile scaricare il calendario (HTTP ${upstream.status})` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await upstream.text();

    if (!body.includes("BEGIN:VCALENDAR")) {
      return new Response(
        JSON.stringify({ error: "Il contenuto scaricato non sembra un file iCal valido" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendario.ics"',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Errore durante il recupero del calendario" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/fetch-ical",
};
