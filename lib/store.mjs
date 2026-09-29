/*
 * Açar-dəyər anbarı.
 * Vercel-də: Upstash Redis (REST), KV_REST_API_URL / KV_REST_API_TOKEN
 * Lokalda:   data/local-store.json (eyni Redis əmrləri JS-də təqlid olunur)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'data', 'local-store.json');

const restUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const restToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

// redis: canlı baza · file: lokal fayl · none: Vercel-də baza qoşulmayıb
export const storeKind = () => (restUrl() && restToken() ? 'redis' : process.env.VERCEL ? 'none' : 'file');

export class StoreMissingError extends Error {
  constructor() {
    super('Məlumat bazası qoşulmayıb (Upstash Redis)');
    this.code = 'STORE_MISSING';
  }
}

async function redisPipeline(commands) {
  const res = await fetch(`${restUrl()}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${restToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands.map((c) => c.map(String))),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

/* ---------- lokal fayl anbarı ---------- */

let db = null;
let saveTimer = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    db = { data: {}, exp: {} };
  }
  return db;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(db));
  }, 120);
}

function live(key) {
  const e = db.exp[key];
  if (e && e < Date.now()) {
    delete db.data[key];
    delete db.exp[key];
  }
  return db.data[key];
}
const asHash = (k) => {
  const v = live(k);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : (db.data[k] = {});
};
const asList = (k) => {
  const v = live(k);
  return Array.isArray(v) ? v : (db.data[k] = []);
};
const toNum = (x) => (x === '+inf' ? Infinity : x === '-inf' ? -Infinity : Number(x));

const FILE_COMMANDS = {
  GET: (k) => (typeof live(k) === 'string' ? db.data[k] : null),
  SET: (k, v) => {
    db.data[k] = String(v);
    delete db.exp[k];
    return 'OK';
  },
  DEL: (...ks) => ks.filter((k) => k in db.data && (delete db.data[k], delete db.exp[k], true)).length,
  INCR: (k) => {
    const v = Number(typeof live(k) === 'string' ? db.data[k] : 0) + 1;
    db.data[k] = String(v);
    return v;
  },
  EXPIRE: (k, s) => {
    if (live(k) === undefined) return 0;
    db.exp[k] = Date.now() + Number(s) * 1000;
    return 1;
  },
  HINCRBY: (k, f, by) => {
    const h = asHash(k);
    h[f] = Number(h[f] || 0) + Number(by);
    return h[f];
  },
  HGETALL: (k) => {
    const h = live(k);
    return h && typeof h === 'object' && !Array.isArray(h) ? Object.entries(h).flatMap(([f, v]) => [f, String(v)]) : [];
  },
  PFADD: (k, ...ids) => {
    const l = asList(k);
    const before = l.length;
    for (const id of ids) if (!l.includes(id)) l.push(id);
    return l.length > before ? 1 : 0;
  },
  PFCOUNT: (...ks) => new Set(ks.flatMap((k) => (Array.isArray(live(k)) ? db.data[k] : []))).size,
  ZADD: (k, score, member) => {
    asHash(k)[member] = Number(score);
    return 1;
  },
  ZREMRANGEBYSCORE: (k, min, max) => {
    const z = asHash(k);
    let n = 0;
    for (const [m, s] of Object.entries(z)) if (s >= toNum(min) && s <= toNum(max)) (delete z[m], n++);
    return n;
  },
  ZCOUNT: (k, min, max) => Object.values(asHash(k)).filter((s) => s >= toNum(min) && s <= toNum(max)).length,
  LPUSH: (k, ...vs) => {
    const l = asList(k);
    for (const v of vs) l.unshift(String(v));
    return l.length;
  },
  LTRIM: (k, a, b) => {
    db.data[k] = asList(k).slice(Number(a), Number(b) + 1);
    return 'OK';
  },
  LRANGE: (k, a, b) => asList(k).slice(Number(a), Number(b) === -1 ? undefined : Number(b) + 1),
};

/** Bir neçə Redis əmrini bir sorğuda icra edir: [["HINCRBY","k","f",1], ...] */
export async function run(commands) {
  if (!commands.length) return [];
  const kind = storeKind();
  if (kind === 'redis') return redisPipeline(commands);
  if (kind === 'none') throw new StoreMissingError();
  load();
  const out = commands.map(([name, ...args]) => {
    const fn = FILE_COMMANDS[String(name).toUpperCase()];
    if (!fn) throw new Error(`Dəstəklənməyən əmr: ${name}`);
    return fn(...args.map(String));
  });
  persist();
  return out;
}

export const cmd = async (...command) => (await run([command]))[0];

/** Redis HGETALL cavabını ([f, v, f, v]) obyektə çevirir */
export function hashToObject(arr) {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]) || 0;
  else if (arr && typeof arr === 'object') for (const [k, v] of Object.entries(arr)) o[k] = Number(v) || 0;
  return o;
}
