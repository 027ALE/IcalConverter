import {
  createSessionToken,
  getUserRole,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  jsonResponse,
} from "./auth-utils.js";

export default async (req, context) => {
  if (req.method === "GET") {
    const session = await getSession(req);
    if (!session) return jsonResponse({ error: "Autenticazione richiesta." }, 401);
    return jsonResponse({ ok: true, user: { email: session.email }, role: session.role });
  }

  if (req.method === "POST") {
    const identityUser = context?.clientContext?.user;
    const email = identityUser?.email?.trim().toLowerCase();

    if (!identityUser || !email) {
      return jsonResponse({ error: "Login tramite Netlify Identity richiesto." }, 401);
    }

    const role = await getUserRole(email);
    if (!role) {
      return jsonResponse({ error: "Account non autorizzato. Contatta l'amministratore." }, 403);
    }

    let token;
    try {
      token = await createSessionToken({ email, role });
    } catch {
      return jsonResponse({ error: "Configurazione di autenticazione non disponibile." }, 500);
    }

    const res = jsonResponse({ ok: true, user: { email }, role });
    setSessionCookie(res, token);
    return res;
  }

  if (req.method === "DELETE") {
    const res = jsonResponse({ ok: true });
    clearSessionCookie(res);
    return res;
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = { path: "/api/auth" };
