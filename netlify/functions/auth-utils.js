// auth-utils.js
//
// Autenticazione: affidata al 100% a Netlify Identity nativo. Non esiste
// nessun login custom, nessun cookie di sessione, nessuna password gestita
// da noi, nessuna whitelist gestita dall'app.
//
// Netlify inietta automaticamente `context.clientContext.user` quando il
// client manda l'header `Authorization: Bearer <jwt-identity>` con un JWT
// valido rilasciato da Netlify Identity. Se l'header manca o il JWT non è
// valido, `context.clientContext.user` è assente: per noi equivale a
// "nessuno autenticato". Questo è l'UNICO punto da cui deriviamo "chi è
// l'utente" in tutte le function.
//
// Autorizzazione: usiamo esclusivamente i Ruoli nativi di Netlify Identity
// (Identity → Users → seleziona utente → Roles), che Netlify inserisce nel
// JWT come `app_metadata.roles`. L'app conosce solo 2 ruoli:
//   - "admin"    -> assegnato all'utente dal pannello Netlify Identity.
//                   Può anche modificare/eliminare i link salvati.
//   - "standard" -> qualunque utente Identity autenticato che non ha il
//                   ruolo "admin". Può consultare, scaricare e salvare
//                   nuovi link.
//
// Chi può creare account e chi può accedere è deciso interamente da Netlify
// (Identity → Registration: "Invite only" per limitare gli accessi, oppure
// aperta se si preferisce). L'app non crea, invita, elenca o gestisce in
// alcun modo gli utenti: si limita a leggere il ruolo già presente nel JWT.

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// L'utente Identity, come iniettato da Netlify a partire dal Bearer JWT.
// Ritorna null se non c'è nessun utente autenticato con un JWT valido.
function getIdentityUser(context) {
  return context?.clientContext?.user || null;
}

function getUserEmail(user) {
  return (user?.email || "").trim().toLowerCase();
}

// Ruoli nativi assegnati all'utente dal pannello Netlify Identity.
function getIdentityRoles(user) {
  const roles = user?.app_metadata?.roles;
  return Array.isArray(roles) ? roles : [];
}

// L'app conosce solo 2 livelli: "admin" (ruolo Netlify Identity "admin")
// e "standard" (chiunque sia autenticato e non abbia il ruolo "admin").
// Confronto case-insensitive: evita ambiguità se in Identity → Users →
// Roles il ruolo viene digitato come "Admin"/"ADMIN" invece di "admin".
function getRole(user) {
  const roles = getIdentityRoles(user).map((r) => String(r).trim().toLowerCase());
  return roles.includes("admin") ? "admin" : "standard";
}

// Helper unico per proteggere una function: verifica identità + ruolo
// minimo richiesto. Usarlo in ogni function protetta evita divergenze tra
// gli endpoint.
export async function requireRole(req, context, minRole = "standard") {
  const identityUser = getIdentityUser(context);
  const email = getUserEmail(identityUser);

  if (!email) {
    return { error: jsonResponse({ error: "Autenticazione richiesta." }, 401) };
  }

  const role = getRole(identityUser);

  if (minRole === "admin" && role !== "admin") {
    return { error: jsonResponse({ error: "Permessi insufficienti per questa operazione." }, 403) };
  }

  return { email, role };
}
