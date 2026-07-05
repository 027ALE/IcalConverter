import {
  getSession,
  requireRole,
  readUsers,
  addManagedUser,
  removeManagedUser,
  getAdminEmail,
  jsonResponse,
} from "./auth-utils.js";

async function inviteViaIdentity(context, email) {
  const identity = context?.clientContext?.identity;
  if (!identity?.url || !identity?.token) {
    return { invited: false, reason: "Identity admin token non disponibile." };
  }
  const res = await fetch(`${identity.url}/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, confirm: false }),
  });
  return { invited: res.ok, status: res.status };
}

async function notifyAdmin(email, role) {
  const webhook = process.env.APP_NOTIFY_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: getAdminEmail(),
        subject: "Nuovo utente creato",
        text: `È stato creato un account ${role} per ${email}.`,
      }),
    });
  } catch {
    // Notifica opzionale: un fallimento qui non deve bloccare la creazione utente.
  }
}

export default async (req, context) => {
  const session = await getSession(req);
  if (!requireRole(session, ["admin"])) {
    return jsonResponse({ error: "Solo l'amministratore può gestire gli utenti." }, 403);
  }

  if (req.method === "GET") {
    const users = await readUsers();
    return jsonResponse({ admin: getAdminEmail(), users });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Corpo della richiesta non valido." }, 400);
    }

    const email = (body?.email || "").trim().toLowerCase();
    const role = body?.role;
    if (!email || !["standard", "intermediate"].includes(role)) {
      return jsonResponse({ error: "Email o ruolo non valido." }, 400);
    }

    let entry;
    try {
      entry = await addManagedUser(email, role, session.email);
    } catch (err) {
      return jsonResponse({ error: err.message }, 400);
    }

    const invite = await inviteViaIdentity(context, email);
    await notifyAdmin(email, role);

    return jsonResponse({ ok: true, user: { email, ...entry }, invite });
  }

  if (req.method === "DELETE") {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) return jsonResponse({ error: "Email mancante." }, 400);
    const removed = await removeManagedUser(email);
    if (!removed) return jsonResponse({ error: "Utente non trovato." }, 404);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Metodo non supportato." }, 405);
};

export const config = { path: "/api/users" };
