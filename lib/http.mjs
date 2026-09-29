// Handler-lər platformadan asılı deyil: { method, query, body, cookies, headers, ip, secure } alır,
// { status, headers?, body? } qaytarır. Bu fayl onları Vercel-ə və lokal Node serverinə bağlayır.
import { StoreMissingError } from './store.mjs';

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function parseBody(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
  } catch {
    return null;
  }
}

export const json = (status, body, headers = {}) => ({ status, headers: { 'cache-control': 'no-store', ...headers }, body });

async function safe(handler, req) {
  try {
    return await handler(req);
  } catch (err) {
    if (err instanceof StoreMissingError) return json(503, { error: err.message, code: err.code });
    console.error(err);
    return json(500, { error: 'Server xətası' });
  }
}

function write(res, out) {
  const headers = { 'x-content-type-options': 'nosniff', ...(out.headers || {}) };
  let body = out.body;
  if (body !== undefined && body !== null && !Buffer.isBuffer(body) && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['content-type'] ??= 'application/json; charset=utf-8';
  }
  res.statusCode = out.status || 200;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body ?? '');
}

/** Vercel serverless funksiyası üçün */
export const vercel = (handler) => async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const out = await safe(handler, {
    method: req.method,
    query: Object.fromEntries(url.searchParams),
    body: parseBody(req.body),
    cookies: parseCookies(req.headers.cookie),
    headers: req.headers,
    ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
    secure: true,
  });
  write(res, out);
};

/** Lokal Node http serveri üçün (server.mjs) */
export async function node(handler, req, res, url) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 3_000_000) return write(res, json(413, { error: 'Sorğu çox böyükdür' }));
    chunks.push(c);
  }
  const out = await safe(handler, {
    method: req.method,
    query: Object.fromEntries(url.searchParams),
    body: parseBody(Buffer.concat(chunks)),
    cookies: parseCookies(req.headers.cookie),
    headers: req.headers,
    ip: req.socket.remoteAddress || '',
    secure: false,
  });
  write(res, out);
}
