import { SignJWT, jwtVerify } from "jose";
import { getStore } from "@netlify/blobs";

const USERS_STORE = "app-users";
const USERS_KEY = "users.json";
const SESSION_COOKIE = "app_session";

function getJwtSecret() {
  const secret = process.env.APP_AUTH_JWT_SECRET;
  if (!secret) throw new Error("APP_AUTH_JWT_SECRET non configurato.");
  return secret;
}

export function getAdminEmail() {
  return (process.env.APP_ADMIN_EMAIL || "").trim().toLowerCase();
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function usersStore() {
  return getStore({ name: USERS_STORE, consistency: "strong" });
}

export async function readUsers() {
  try {
    const data = await usersStore().get(USERS_KEY, { type: "json" });
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function writeUsers(users) {
  await usersStore().setJSON(USERS_KEY, users);
}

export async function getUserRole(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === getAdminEmail()) return "admin";
  const users = await readUsers();
  const entry = users[normalized];
  return entry ? entry.role : null;
}

export async function addManagedUser(email, role, addedBy) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) throw new Error("Email mancante.");
  if (!["standard", "intermediate"].includes(role)) throw new Error("Ruolo non valido.");
  if (normalized === getAdminEmail()) throw new Error("Questa email è già amministratore.");
  const users = await readUsers();
  users[normalized] = { role, addedBy, addedAt: Date.now() };
  await writeUsers(users);
  return users[normalized];
}

export async function removeManagedUser(email) {
  const normalized = (email || "").trim().toLowerCase();
  const users = await readUsers();
  if (!(normalized in users)) return false;
  delete users[normalized];
  await writeUsers(users);
  return true;
}

export async function createSessionToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(getJwtSecret()));
}

export async function verifySessionToken(token) {
  if (!token) throw new Error("Sessione assente.");
  const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()));
  return payload;
}

export function getCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function setSessionCookie(res, token) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${60 * 60 * 8}`,
  ];
  res.headers.append("Set-Cookie", attrs.join("; "));
}

export function clearSessionCookie(res) {
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export async function getSession(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try {
    const payload = await verifySessionToken(token);
    if (!payload?.email || !payload?.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireRole(session, allowedRoles) {
  return !!session && allowedRoles.includes(session.role);
}
