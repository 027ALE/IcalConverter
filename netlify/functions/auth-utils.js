// auth-utils.js
//
// Fondamento della sicurezza dell'app: l'AUTENTICAZIONE è affidata
// interamente a Netlify Identity nativo. Non esiste nessun login custom,
// nessun cookie di sessione, nessuna password gestita da noi.
//
// Netlify inietta automaticamente `context.clientContext.user` quando il
// client manda l'header `Authorization: Bearer <jwt-identity>` con un JWT
// valido rilasciato da Netlify Identity. Se l'header manca o il JWT non è
// valido, `context.clientContext.user` è assente: per noi equivale a
// "nessuno autenticato". Questo è l'UNICO punto da cui deriviamo "chi è
// l'utente" in tutte le function.
//
// L'AUTORIZZAZIONE (chi può fare cosa) è invece un concetto della nostra
// app, su 3 ruoli:
//   - admin      -> definito ESCLUSIVAMENTE dalla variabile d'ambiente
//                    APP_ADMIN_EMAILS (mai modificabile da UI, mai da Blobs:
//                    così l'admin non può mai auto-bloccarsi fuori).
//   - intermedio -> può anche modificare/eliminare i link salvati.
//   - standard   -> può solo consultare, scaricare e salvare nuovi link.
// I ruoli intermedio/standard sono assegnati dall'admin e persistiti su
// Netlify Blobs (store "app-roles", chiave "roles.json").
// Se un'email non è admin e non è presente nella mappa ruoli, l'utente è
// autenticato con Netlify Identity ma NON è autorizzato a usare l'app
// (nessun accesso di default: whitelist-only, mai opt-out).

import { getStore } from "@netlify/blobs";

const ROLE_STORE = "app-roles";
const ROLE_KEY = "roles.json";

export const ROLES = ["standard", "intermedio", "admin"];
const ROLE_RANK = { standard: 1, intermedio: 2, admin: 3 };

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function parseEmailList(raw) {
  return (raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails() {
  return parseEmailList(process.env.APP_ADMIN_EMAILS || "");
}

export function isEnvAdmin(email) {
  if (!email) return false;
  return getAdminEmails().includes(email);
}

// L'utente Identity, come iniettato da Netlify a partire dal Bearer JWT.
// Ritorna null se non c'è nessun utente autenticato con un JWT valido.
export function getIdentityUser(context) {
  return context?.clientContext?.user || null;
}

// Le credenziali "admin" di Identity (GoTrue) che Netlify inietta insieme
// all'utente: servono solo per invitare nuovi utenti via API nativa.
export function getIdentityAdminApi(context) {
  const identity = context?.clientContext?.identity;
  if (!identity?.url || !identity?.token) return null;
  return { url: identity.url, token: identity.token };
}

export function getUserEmail(user) {
  return (user?.email || "").trim().toLowerCase();
}

function rolesStore() {
  return getStore({ name: ROLE_STORE, consistency: "strong" });
}

export async function readRoles() {
  try {
    const data = await rolesStore().get(ROLE_KEY, { type: "json" });
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export async function writeRoles(roles) {
  await rolesStore().setJSON(ROLE_KEY, roles);
}

// Risolve il ruolo applicativo di un'email, oppure null se non autorizzata.
export async function resolveRole(email) {
  if (!email) return null;
  if (isEnvAdmin(email)) return "admin";
  const roles = await readRoles();
  const role = roles[email];
  return ROLES.includes(role) ? role : null;
}

export function hasAtLeastRole(role, minRole) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}

// Helper unico per proteggere una function: verifica identità + ruolo
// minimo richiesto. Usarlo in ogni function protetta evita divergenze tra
// gli endpoint (una delle cause principali di instabilità del sistema
// precedente, che duplicava questa logica in ogni file).
export async function requireRole(req, context, minRole = "standard") {
  const identityUser = getIdentityUser(context);
  const email = getUserEmail(identityUser);

  if (!email) {
    return { error: jsonResponse({ error: "Autenticazione richiesta." }, 401) };
  }

  const role = await resolveRole(email);
  if (!role) {
    return {
      error: jsonResponse(
        { error: "Account non autorizzato. Contatta l'amministratore per essere invitato." },
        403
      ),
    };
  }

  if (!hasAtLeastRole(role, minRole)) {
    return { error: jsonResponse({ error: "Permessi insufficienti per questa operazione." }, 403) };
  }

  return { email, role };
}
