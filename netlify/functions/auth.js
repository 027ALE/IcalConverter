import {
  clearCookie,
  createSessionToken,
  getAuthenticatedUser,
  getUserEmail,
  isAdminUser,
  isAllowedUser,
  jsonResponse,
  setCookie,
} from "./auth-utils.js";

export default async (req, context) => {
  if (req.method === "GET") {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse({ error: "Autenticazione richiesta." }, 401);
    }

    const email = getUserEmail(user);
    if (!email || !isAllowedUser(user)) {
      return jsonResponse({ error: "Account non autorizzato." }, 403);
    }

    return jsonResponse({
      ok: true,
      user: {
        email,
      },
      isAllowed: true,
      isAdmin: isAdminUser(user),
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const identityEmail = context?.clientContext?.user?.email?.trim().toLowerCase() || "";
    const email = identityEmail || (typeof body?.email === "string" ? body.email.trim().toLowerCase() : "");
    const provider = context?.clientContext?.user?.app_metadata?.provider || (typeof body?.provider === "string" ? body.provider : "google");

    if (!email) {
      return jsonResponse({ error: "Email mancante." }, 400);
    }

    if (!isAllowedUser({ email })) {
      return jsonResponse({ error: "Account non autorizzato." }, 403);
    }

    let token;
    try {
      token = await createSessionToken({ email, provider, role: isAdminUser({ email }) ? "admin" : "standard" });
    } catch {
      return jsonResponse({ error: "Configurazione di autenticazione non disponibile." }, 500);
    }

    const bodyPayload = {
      ok: true,
      user: { email },
      isAllowed: true,
      isAdmin: isAdminUser({ email }),
    };

    const res = new Response(JSON.stringify(bodyPayload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

    setCookie(res, "app_session", token, { maxAge: 60 * 60 * 8, secure: true });
    return res;
  }

  if (req.method === "DELETE") {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    clearCookie(res, "app_session");
    return res;
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = {
  path: "/api/auth",
};
