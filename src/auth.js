import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { demoMode } from './demo.js';

// The demo publishes its credentials, so they may be short and default to demo / demo.
const username = process.env.AUTH_USERNAME || (demoMode ? 'demo' : '');
const password = process.env.AUTH_PASSWORD || (demoMode ? 'demo' : '');
if (!username || !password || (!demoMode && password.length < 12))
  throw new Error('AUTH_USERNAME and AUTH_PASSWORD (at least 12 characters) are required');
export const demoCredentials = demoMode ? { username, password } : null;
const salt = randomBytes(16);
const passwordHash = scryptSync(password, salt, 64);
const sessions = new Map();
const DEFAULT_SESSION_TTL_HOURS = 24;
const MAX_SESSION_TTL_HOURS = 24 * 365;
let sessionTtlMs = sessionHoursToMs(
  process.env.AUTH_SESSION_TTL_HOURS ?? DEFAULT_SESSION_TTL_HOURS,
);
const digest = (value) => createHash('sha256').update(value).digest();
function sessionHoursToMs(value) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 1 || hours > MAX_SESSION_TTL_HOURS)
    throw new Error('ログイン維持時間は1〜8760時間で指定してください');
  return Math.round(hours * 60 * 60 * 1000);
}
function prune(now = Date.now()) {
  for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
}
let failures = 0;
let blockedUntil = 0;
export function login(name, secret) {
  const now = Date.now();
  if (now < blockedUntil)
    throw Object.assign(new Error('しばらく待って再試行してください'), { status: 429 });
  const valid =
    typeof name === 'string' &&
    typeof secret === 'string' &&
    secret.length <= 1024 &&
    timingSafeEqual(digest(name), digest(username)) &&
    timingSafeEqual(scryptSync(secret, salt, 64), passwordHash);
  if (!valid) {
    // A shared lockout would let one visitor block everyone else from the public demo.
    if (!demoMode && ++failures >= 10) {
      blockedUntil = now + 60000;
      failures = 0;
    }
    throw Object.assign(new Error('ユーザー名またはパスワードが違います'), { status: 401 });
  }
  failures = 0;
  prune(now);
  if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
  const token = randomBytes(32).toString('hex');
  const expiresAt = now + sessionTtlMs;
  sessions.set(token, expiresAt);
  return { token, username, expiresAt: new Date(expiresAt).toISOString() };
}
export function authorize(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token || (sessions.get(token) || 0) <= Date.now())
    throw Object.assign(new Error('ログインしてください'), { status: 401 });
  return token;
}
export function logout(token) {
  sessions.delete(token);
}
export function sessionSettings(token) {
  prune();
  return {
    sessionTtlHours: sessionTtlMs / 60 / 60 / 1000,
    activeSessions: sessions.size,
    currentSessionExpiresAt:
      token && sessions.has(token) ? new Date(sessions.get(token)).toISOString() : null,
  };
}
export function setSessionTtlHours(hours) {
  sessionTtlMs = sessionHoursToMs(hours);
  return sessionSettings();
}
export function revokeSessions(exceptToken) {
  for (const key of sessions.keys()) if (key !== exceptToken) sessions.delete(key);
  return sessionSettings(exceptToken);
}
