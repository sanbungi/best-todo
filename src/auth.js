import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const username = process.env.AUTH_USERNAME;
const password = process.env.AUTH_PASSWORD;
if (!username || !password || password.length < 12)
  throw new Error('AUTH_USERNAME and AUTH_PASSWORD (at least 12 characters) are required');
const salt = randomBytes(16);
const passwordHash = scryptSync(password, salt, 64);
const sessions = new Map();
const digest = (value) => createHash('sha256').update(value).digest();
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
    if (++failures >= 10) {
      blockedUntil = now + 60000;
      failures = 0;
    }
    throw Object.assign(new Error('ユーザー名またはパスワードが違います'), { status: 401 });
  }
  failures = 0;
  for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
  if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, now + 24 * 60 * 60 * 1000);
  return { token, username };
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
