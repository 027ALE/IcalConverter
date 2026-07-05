// auth.js — GET /api/auth
//
// Unico scopo: dire al frontend "chi sono e cosa posso fare", leggendo
// esclusivamente context.clientContext.user (Netlify Identity nativo) e
// risolvendo il ruolo applicativo. Non crea nessuna sessione custom: non
// c'è nessun POST/DELETE qui, perché login e logout sono gestiti al 100%
// dal widget Netlify Identity lato client.

import { getIdentityUser, getUserEmail, resolveRole, jsonResponse } from "./auth-utils.js";

export default async (req, context) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Metodo non supportato." }, 405);
  }

  const user = getIdentityUser(context);
  const email = getUserEmail(user);

  if (!email) {
    return jsonResponse({ error: "Autenticazione richiesta." }, 401);
  }

  const role = await resolveRole(email);
  if (!role) {
    return jsonResponse(
      { error: "Account non autorizzato. Contatta l'amministratore per essere invitato." },
      403
    );
  }

  return jsonResponse({
    ok: true,
    user: { email },
    role,
    isAdmin: role === "admin",
    canEditLinks: role === "admin" || role === "intermedio",
  });
};

export const config = {
  path: "/api/auth",
};
