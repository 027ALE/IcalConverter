// auth.js — GET /api/auth
//
// Unico scopo: dire al frontend "chi sono e cosa posso fare", leggendo
// esclusivamente il JWT di Netlify Identity tramite requireRole (lo stesso
// helper condiviso usato da tutte le altre function protette). Non crea
// nessuna sessione custom: non c'è nessun POST/DELETE qui, perché login,
// logout e creazione utenti sono gestiti al 100% da Netlify Identity.

import { requireRole, jsonResponse } from "./auth-utils.js";

export default async (req, context) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Metodo non supportato." }, 405);
  }

  const auth = await requireRole(req, context, "standard");
  if (auth.error) return auth.error;

  return jsonResponse({
    ok: true,
    user: { email: auth.email },
    role: auth.role,
    isAdmin: auth.role === "admin",
  });
};

export const config = {
  path: "/api/auth",
};
