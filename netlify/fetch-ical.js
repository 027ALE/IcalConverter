import { getSession } from "./auth-utils.js";

export default async (req) => {
  const session = await getSession(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Autenticazione richiesta." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return new Response(JSON.stringify({ error: "Parametro 'url' mancante." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let target;
  try {
    target = new URL(url.replace(/^webcal:\/\//i, "https://"));
    if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "URL non valido o protocollo non supportato." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; iCal-Downloader/1.0)" },
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${upstream.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = await upstream.text();
    if (!body.includes("BEGIN:VCALENDAR")) {
      return new Response(JSON.stringify({ error: "Contenuto non valido." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendario.ics"',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Errore durante il recupero." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/fetch-ical" };
