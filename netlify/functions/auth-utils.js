import { SignJWT, jwtVerify } from "jose";

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function parseList(raw) {
  return (raw || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedEmails() {
  return parseList(process.env.APP_AUTH_ALLOWED_EMAILS || "");
}

export function getAdminEmails() {
  return parseList(process.env.APP_AUTH_ADMIN_EMAILS || "");
}

function getJwtSecret() {
  return process.env.APP_AUTH_JWT_SECRET || process.env.JWT_SECRET || "fallback-session-secret";
}

export async function createSessionToken(payload) {
  const secret = getJwtSecret();

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) {
    throw new Error("Invalid session");
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  return payload;
}

export function getCookie(req, name) {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function setCookie(res, name, value, options = {}) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];

  if (options.maxAge) attrs.push(`Max-Age=${options.maxAge}`);
  if (options.expires) attrs.push(`Expires=${options.expires.toUTCString()}`);
  if (options.secure !== false) attrs.push("Secure");

  res.headers.append("Set-Cookie", attrs.join("; "));
}

export function clearCookie(res, name) {
  const attrs = [`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`];
  res.headers.append("Set-Cookie", attrs.join("; "));
}

export async function getAuthenticatedUser(req) {
  const token = getCookie(req, "app_session");
  if (!token) return null;

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export function getUserEmail(user) {
  return user?.email?.trim().toLowerCase() || "";
}

export function isAllowedUser(user) {
  const email = getUserEmail(user);
  const allowed = getAllowedEmails();

  if (!email) return false;
  if (!allowed.length) return true;

  return allowed.includes(email);
}

export function isAdminUser(user) {
  const email = getUserEmail(user);
  const admins = getAdminEmails();

  if (!email) return false;
  if (!admins.length) return false;

  return admins.includes(email);
}
