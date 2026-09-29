#!/usr/bin/env node
/*
 * Lokal server: statik faylları verir və Vercel funksiyaları ilə eyni API-ləri işlədir.
 *
 * /api/menu       qiymətləri Clopos menyusundan canlı çəkir (keşlə), alınmasa
 *                 data/menu.json-dakı son versiyanı qaytarır
 * /api/site, /api/track, /api/img, /api/admin   idarə paneli üçün
 * /cc-7k2p        panelin özü (lokalda məlumat data/local-store.json-da,
 *                 şifrə .env.local-da)
 *
 * node server.mjs          http://localhost:5173
 * PORT=8080 node server.mjs
 */
import http from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MENU_URL, MENU_JSON_PATH, saveMenu, scrapeMenu } from './scripts/scrape-menu.mjs';
import { node as nodeAdapter } from './lib/http.mjs';
import { adminHandler, imgHandler, siteHandler, trackHandler } from './lib/routes.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// .env.local: yalnız lokal inkişaf üçün (məs. ADMIN_PASSWORD)
try {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  /* .env.local yoxdur */
}

const API = { '/api/site': siteHandler, '/api/track': trackHandler, '/api/img': imgHandler, '/api/admin': adminHandler };
const PORT = Number(process.env.PORT) || 5173;
const MENU_URL = process.env.MENU_URL || DEFAULT_MENU_URL;
const MENU_TTL_MS = (Number(process.env.MENU_TTL_MIN) || 30) * 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------- menyu keşi ---------- */

let cache = null; // { data, at }
let inflight = null;

async function loadFromDisk() {
  try {
    const data = JSON.parse(await readFile(MENU_JSON_PATH, 'utf8'));
    return { data, at: Date.parse(data.fetchedAt) || 0 };
  } catch {
    return null;
  }
}

function refreshMenu() {
  inflight ??= scrapeMenu(MENU_URL)
    .then(async (data) => {
      cache = { data, at: Date.now() };
      await saveMenu(data).catch(() => {});
      console.log(`  menyu yeniləndi: ${data.stats.products} məhsul`);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function getMenu({ force = false } = {}) {
  cache ??= await loadFromDisk();
  if (force || !cache) {
    try {
      return (await refreshMenu()).data;
    } catch (err) {
      if (cache) return cache.data;
      throw err;
    }
  }
  if (Date.now() - cache.at > MENU_TTL_MS) {
    refreshMenu().catch((err) => console.warn('  ! menyu yenilənmədi:', err.message));
  }
  return cache.data;
}

/* ---------- server ---------- */

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'cache-control': 'no-store', ...headers });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(ROOT, rel));
  const inside = file.startsWith(ROOT + sep) || file === ROOT;
  const hidden = rel.split('/').some((part) => part.startsWith('.'));
  if (!inside || hidden) return send(res, 403, 'Forbidden');

  let info;
  try {
    info = await stat(file);
  } catch {
    return send(res, 404, 'Not found', { 'content-type': 'text/plain; charset=utf-8' });
  }
  if (info.isDirectory()) return serveStatic(req, res, rel.replace(/\/?$/, '/'));

  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/menu') {
      const data = await getMenu({ force: url.searchParams.has('refresh') });
      return send(res, 200, JSON.stringify(data), { 'content-type': MIME['.json'] });
    }
    if (API[url.pathname]) return await nodeAdapter(API[url.pathname], req, res, url);
    if (url.pathname.startsWith('/data/local-store')) return send(res, 403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, JSON.stringify({ error: err.message }), { 'content-type': MIME['.json'] });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Clock & Coffee: http://localhost:${PORT}\n  menyu mənbəyi: ${MENU_URL}\n`);
  getMenu().catch((err) => console.warn('  ! ilk menyu yüklənməsi alınmadı:', err.message));
});
