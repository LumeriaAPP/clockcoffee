/**
 * Admin girişi: ADMIN_PASSWORD mühit dəyişəni + HMAC ilə imzalanmış sessiya cookie-si.
 * Şifrə dəyişəndə bütün köhnə sessiyalar avtomatik etibarsız olur.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'cc_admin';
const SESSION_DAYS = 7;

const password = () => process.env.ADMIN_PASSWORD || '';
const secret = () => createHash('sha256').update(`cc-admin-session:${password()}`).digest();
const sha = (s) => createHash('sha256').update(String(s ?? '')).digest();

export const adminConfigured = () => password().length >= 6;

export function checkPassword(input) {
  if (!adminConfigured()) return false;
  return timingSafeEqual(sha(input), sha(password()));
}

export function createSession() {
  const payload = `${Date.now() + SESSION_DAYS * 864e5}.${randomBytes(9).toString('base64url')}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, maxAge: SESSION_DAYS * 86400 };
}

export function verifySession(token) {
  if (!adminConfigured() || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3 || Number(parts[0]) < Date.now()) return false;
  const expected = Buffer.from(createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest('base64url'));
  const given = Buffer.from(parts[2]);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const sessionCookie = (token, maxAge, secure) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

export const clearCookie = (secure) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;

// IP-ni saxlamırıq, yalnız giriş limitini hesablamaq üçün qısa hash
export const ipKey = (ip) => sha(`cc-ip:${ip || 'unknown'}`).toString('hex').slice(0, 16);
