// users.js — /api/users
//
// Gestione utenti riservata all'amministratore (email definita in
// APP_ADMIN_EMAILS). L'admin può:
//   GET    -> elencare gli utenti abilitati e il loro ruolo
//   POST   -> invitare una nuova email con ruolo "standard" o "intermedio"
//             (usa l'API admin nativa di Netlify Identity per inviare
//             l'invito via email: nessun sistema di invio email custom)
//   PUT    -> cambiare il ruolo di un utente già invitato
//   DELETE -> revocare l'accesso all'app di un'email (rimuove il ruolo:
//             da quel momento quell'email, anche se ha ancora un account
//             Identity, non passa più `requireRole` in nessuna function)
//
// L'admin stesso non è mai modificabile/rimovibile da qui: è definito solo
// dalla variabile d'ambiente, quindi non può mai essere bloccato fuori per
// errore da questa interfaccia.

import {
  getIdentityUser,
  getUserEmail,
  resolveRole,
  isEnvAdmin,
  getAdminEmails,
  readRoles,
  writeRoles,
  getIdentityAdminApi,
  jsonResponse,
} from "./auth-utils.js";

const ASSIGNABLE_ROLES = ["standard", "intermedio"];

async function requireAdmin(context) {
  const user = getIdentityUser(context);
  const email = getUserEmail(user);

  if (!email) {
    return { error: jsonResponse({ error: "Autenticazione richiesta." }, 401) };
  }

  const role = await resolveRole(email);
  if (role !== "admin") {
    return { error: jsonResponse({ error: "Solo l'amministratore può gestire gli utenti." }, 403) };
  }

  return { email };
}

export default async (req, context) => {
  const check = await requireAdmin(context);
  if (check.error) return check.error;

  const method = req.method;

  if (method === "GET") {
    const roles = await readRoles();
    const admins = getAdminEmails();
    const users = [
      ...admins.map((email) => ({ email, role: "admin", managedBy: "env" })),
      ...Object.entries(roles).map(([email, role]) => ({ email, role, managedBy: "blobs" })),
    ];
    return jsonResponse({ users });
  }

  if (method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
    const role = body.role;

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "Email non valida." }, 400);
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return jsonResponse({ error: "Ruolo non valido." }, 400);
    }
    if (isEnvAdmin(email)) {
      return jsonResponse({ error: "Questa email è già amministratore." }, 409);
    }

    const roles = await readRoles();
    roles[email] = role;
    await writeRoles(roles);

    // Invito nativo via Netlify Identity: l'utente riceve un'email da
    // Netlify per impostare la propria password e accedere. Nessun invio
    // email custom, nessuna gestione di token di invito da parte nostra.
    let inviteSent = false;
    let inviteError = null;
    const adminApi = getIdentityAdminApi(context);
    if (adminApi) {
      try {
        const res = await fetch(`${adminApi.url}/invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminApi.token}`,
          },
          body: JSON.stringify({ email }),
        });
        inviteSent = res.ok;
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          inviteError = errBody.msg || errBody.error || `HTTP ${res.status}`;
        }
      } catch (err) {
        inviteError = err?.message || "Errore di rete verso Netlify Identity.";
      }
    } else {
      inviteError = "Netlify Identity non è abilitato su questo sito.";
    }

    return jsonResponse({ ok: true, email, role, inviteSent, inviteError });
  }

  if (method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
    const role = body.role;

    if (!email) return jsonResponse({ error: "Email mancante." }, 400);
    if (!ASSIGNABLE_ROLES.includes(role)) return jsonResponse({ error: "Ruolo non valido." }, 400);
    if (isEnvAdmin(email)) {
      return jsonResponse({ error: "Il ruolo dell'amministratore non è modificabile qui." }, 409);
    }

    const roles = await readRoles();
    if (!(email in roles)) return jsonResponse({ error: "Utente non trovato." }, 404);

    roles[email] = role;
    await writeRoles(roles);
    return jsonResponse({ ok: true, email, role });
  }

  if (method === "DELETE") {
    const email = (new URL(req.url).searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return jsonResponse({ error: "Email mancante." }, 400);
    if (isEnvAdmin(email)) {
      return jsonResponse({ error: "Non puoi rimuovere l'amministratore." }, 409);
    }

    const roles = await readRoles();
    if (!(email in roles)) return jsonResponse({ error: "Utente non trovato." }, 404);

    delete roles[email];
    await writeRoles(roles);
    return jsonResponse({ ok: true, email });
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = {
  path: "/api/users",
};
