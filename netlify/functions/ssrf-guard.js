// ssrf-guard.js
//
// Protezione contro SSRF (Server-Side Request Forgery) per qualunque
// function che scarica un URL fornito dall'utente (oggi solo
// fetch-ical.js). Isolato in un modulo a parte perché è logica di
// sicurezza a sé stante, testabile da sola e riusabile se in futuro altre
// function dovessero fare fetch verso URL esterni.
//
// Cosa impedisce:
// - richieste verso indirizzi IP privati/riservati (RFC1918, loopback,
//   link-local, "unique local" IPv6, ecc.), inclusi quelli a cui un
//   hostname pubblico potrebbe risolvere;
// - richieste verso l'endpoint di metadata cloud (169.254.169.254 e
//   equivalenti), un bersaglio SSRF classico per rubare credenziali;
// - redirect che portano verso uno di questi indirizzi, seguendo i
//   redirect manualmente e rivalidando ogni hop.
//
// Limite noto (DNS rebinding): la validazione avviene su un lookup DNS
// separato da quello che poi esegue effettivamente `fetch()`. Un
// attaccante che controlla il DNS potrebbe in teoria far risolvere lo
// stesso hostname a un IP diverso (pubblico in fase di validazione,
// privato in fase di connessione reale) nella finestra fra le due
// risoluzioni. Mitigarlo del tutto richiederebbe di pinnare l'indirizzo
// risolto a livello di socket (custom dispatcher), che nell'ambiente
// Netlify Functions non è disponibile in modo affidabile. Il rischio
// residuo è considerato accettabile perché l'endpoint richiede comunque
// un utente autenticato (nessun accesso anonimo) e il pattern di attacco
// necessita di controllare l'infrastruttura DNS del dominio bersaglio.

import { lookup } from "node:dns/promises";

const MAX_REDIRECTS = 5;

// Limite di dimensione applicato al corpo scaricato, per evitare che un
// link malevolo (o solo molto pesante) esaurisca memoria/tempo della
// function. 8 MB sono ampiamente sufficienti per un file .ics reale.
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function ipv4ToInt(parts) {
  return parts.reduce((acc, p) => (acc << 8) + p, 0) >>> 0;
}

function inIpv4Range(ip, base, bits) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const baseParts = base.split(".").map(Number);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(parts) & mask) === (ipv4ToInt(baseParts) & mask);
}

// Intervalli IPv4 non instradabili pubblicamente o riservati: privati
// (RFC1918), loopback, link-local (incluso il metadata endpoint cloud),
// "this network", CGNAT, multicast e riservati IANA.
const BLOCKED_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, include il metadata endpoint 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // riservato
];

function isBlockedIpv4(ip) {
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => inIpv4Range(ip, base, bits));
}

function isBlockedIpv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // fe80::/10, link-local
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true; // fc00::/7, unique local
  }
  // IPv4-mapped IPv6 (::ffff:a.b.c.d): estrae la parte IPv4 e la valida.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

function isBlockedIp(ip, family) {
  return family === 6 ? isBlockedIpv6(ip) : isBlockedIpv4(ip);
}

// Risolve l'hostname e rifiuta se anche solo uno degli indirizzi
// restituiti punta a una destinazione privata/riservata. Un hostname può
// risolvere a più IP (round-robin, dual-stack): basta che uno sia
// interno per considerare l'intero target non sicuro.
async function assertHostIsPublic(hostname) {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Impossibile risolvere l'host di destinazione.");
  }

  if (!addresses.length) {
    throw new Error("Impossibile risolvere l'host di destinazione.");
  }

  for (const { address, family } of addresses) {
    if (isBlockedIp(address, family)) {
      throw new Error("L'URL punta a un indirizzo di rete non consentito.");
    }
  }
}

// Valida un URL (protocollo + hostname/IP) prima di ogni tentativo di
// connessione, incluso ogni singolo hop di redirect.
async function assertUrlIsSafe(url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Protocollo non supportato");
  }

  // Se l'host è già un letterale IP, lo si valida direttamente senza
  // passare dal DNS.
  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // rimuove [] da IPv6 letterali
  const looksLikeIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const looksLikeIpv6 = hostname.includes(":");

  if (looksLikeIpv4) {
    if (isBlockedIpv4(hostname)) throw new Error("L'URL punta a un indirizzo di rete non consentito.");
    return;
  }
  if (looksLikeIpv6) {
    if (isBlockedIpv6(hostname)) throw new Error("L'URL punta a un indirizzo di rete non consentito.");
    return;
  }

  await assertHostIsPublic(hostname);
}

// Esegue il fetch dell'URL indicato seguendo manualmente i redirect (con
// un tetto massimo) e rivalidando ogni destinazione intermedia, così che
// un server malevolo non possa "rimbalzare" la richiesta verso una rete
// interna tramite un 3xx dopo che il controllo iniziale è già passato.
// Applica inoltre un limite alla dimensione del corpo scaricato.
export async function safeFetch(initialUrl, { headers = {}, maxBytes = MAX_RESPONSE_BYTES } = {}) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount++) {
    await assertUrlIsSafe(currentUrl);

    const response = await fetch(currentUrl.toString(), {
      headers,
      redirect: "manual",
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");

    if (isRedirect && location) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Troppi redirect durante il recupero del calendario.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    const body = await readBodyWithLimit(response, maxBytes);
    return { response, body };
  }
}

// Legge lo stream della risposta accumulando i byte fino al limite
// consentito: se viene superato, interrompe subito la lettura invece di
// caricare in memoria un payload arbitrariamente grande.
async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Il file scaricato supera la dimensione massima consentita.");
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(combined);
}
