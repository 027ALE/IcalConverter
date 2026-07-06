// auth-utils.js
//
// Autenticazione: affidata al 100% a Netlify Identity nativo. Non esiste
// nessun login custom, nessun cookie di sessione, nessuna password gestita
// da noi, nessuna whitelist gestita dall'app.
//
// Come troviamo "chi è l'utente" (in ordine):
//   1. Percorso veloce: Netlify inietta automaticamente
//      `context.clientContext.user` quando il client manda l'header
//      `Authorization: Bearer <jwt-identity>` con un JWT valido. Nessuna
//      chiamata di rete extra in questo caso.
//   2. Percorso di riserva: in alcuni casi Netlify non popola
//      `context.clientContext.user` anche con un JWT valido nell'header
//      (comportamento intermittente noto della piattaforma, segnalato più
//      volte nei forum Netlify — non è causato dal nostro codice). In
//      questo caso verifichiamo il token chiamando direttamente
//      l'endpoint GoTrue del sito (`/.netlify/identity/user`), che è la
//      fonte di verità: se il JWT è valido restituisce l'utente,
//      altrimenti risponde lui stesso 401. Nessun indebolimento della
//      sicurezza: la firma del JWT viene comunque validata da Netlify
//      Identity, non la stiamo semplicemente decodificando "a occhio".
// Se nessuno dei due percorsi produce un utente, per noi equivale a
// "nessuno autenticato".
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

function extractBearerToken(req) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Chiama direttamente l'endpoint utente di GoTrue (il motore sotto Netlify
// Identity) con lo stesso Bearer token ricevuto dal client. È l'endpoint
// che Netlify stessa usa per validare i JWT: se il token è scaduto,
// manomesso o non valido, risponde 401 di suo, senza che noi si debba
// reimplementare la verifica della firma.
async function fetchIdentityUserFromGoTrue(req, context) {
  const token = extractBearerToken(req);
  if (!token) return null;

  const identityUrl =
    context?.clientContext?.identity?.url || `${new URL(req.url).origin}/.netlify/identity`;

  try {
    const res = await fetch(`${identityUrl}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// L'utente Identity corrente, provando prima il percorso veloce
// (clientContext, nessuna rete) e poi quello di riserva (chiamata a
// GoTrue). Ritorna null se nessuno dei due produce un utente valido.
async function getIdentityUser(req, context) {
  const fromContext = context?.clientContext?.user;
  if (fromContext) return fromContext;

  return await fetchIdentityUserFromGoTrue(req, context);
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
  const identityUser = await getIdentityUser(req, context);
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
