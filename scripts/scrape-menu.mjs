#!/usr/bin/env node
/*
 * Clopos e-menyu scraper-i: səhifəni (Next.js) yükləyir, içindəki RSC payload-dan
 * kateqoriya və məhsulları çıxarır, "Timer" (maya dəyəri) və adi qiymətləri
 * cütləşdirib data/menu.json-a yazır. Asılılıq yoxdur, Node 18+ fetch-i bəsdir.
 *
 * node scripts/scrape-menu.mjs               standart link
 * node scripts/scrape-menu.mjs <menu-url>    başqa link
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MENU_URL = 'https://clockcoffee.clopos.menu/az/1/products';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MENU_JSON_PATH = resolve(ROOT, 'data', 'menu.json');

// Clopos kateqoriya adlarını saytda göstəriləcək başlıqlara çeviririk.
const SECTION_TITLES = {
  breakfast: 'Səhər yeməyi',
  salatlar: 'Salatlar',
  sendvicler: 'Sendviçlər',
  tostlar: 'Tostlar',
  bowl: 'Bowl',
  'kruasan sendvicleri': 'Kruasan sendviçləri',
  'hot coffee': 'İsti içkilər',
  'cold coffee': 'Soyuq içkilər',
  'soft drinks': 'Sərinləşdiricilər',
  fresh: 'Fresh',
  baton: 'Bulka & kukilər',
  'classic dessert': 'Desertlər',
  extra: 'Əlavələr',
};
const SKIP_SECTIONS = new Set(['servis']);

/* ---------- köməkçilər ---------- */

// Azərbaycan hərflərini müqayisə üçün sadələşdiririk (İ/ı/ə və s.).
const fold = (s) =>
  String(s || '')
    .replace(/İ/g, 'I')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ə/g, 'e')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')

const TIME_TAG = /\(\s*(?:t[iİı]me|timely|extra)\s*\)|\s+t[iİı]me\s*$/gi;
const KCAL_TAG = /\(\s*ümumi kalori[^)]*\)/gi;

const stripTags = (s) => String(s || '').replace(KCAL_TAG, '').replace(TIME_TAG, '').replace(/\s+/g, ' ').trim();
const productKey = (s) => fold(stripTags(s)).replace(/kurasan/g, 'kruasan').replace(/[^a-z0-9]/g, '');

const sectionKey = (name) =>
  fold(name || '')
    .replace(/\(\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*\)/g, '')
    .replace(/\(\s*time\s*\)/g, '')
    .replace(/\s+t\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isTimerCategory = (name) => /\s[Tt]\s*$|\(\s*T[İIı]ME\s*\)/i.test(name || '');

const parseKcal = (...names) => {
  for (const n of names) {
    const m = (n || '').match(/kalori\s*[-–~:]*\s*~?\s*([\d.,]+)/i);
    if (m) return Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || null;
  }
  return null;
};

const cleanDesc = (s) =>
  String(s || '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').replace(/,\s*$/, '').trim();

const capitalize = (s = '') => (s ? s.charAt(0).toLocaleUpperCase('az') + s.slice(1) : s);

/* ---------- Next.js RSC payload parser ---------- */

function extractRscStream(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  let stream = '';
  while ((m = re.exec(html))) stream += JSON.parse(m[1]);
  if (!stream) throw new Error('RSC payload tapılmadı (səhifə strukturu dəyişib?)');
  return stream;
}

function parseRows(stream) {
  const rows = new Map();
  let i = 0;
  while (i < stream.length) {
    const colon = stream.indexOf(':', i);
    if (colon < 0) break;
    const id = stream.slice(i, colon);
    const j = colon + 1;
    if (stream[j] === 'T') {
      // Mətn sətri: "<id>:T<hex bayt uzunluğu>,<mətn>"
      const comma = stream.indexOf(',', j);
      const byteLen = parseInt(stream.slice(j + 1, comma), 16);
      const text = Buffer.from(stream.slice(comma + 1, comma + 1 + byteLen), 'utf8')
        .subarray(0, byteLen)
        .toString('utf8');
      rows.set(id, text);
      i = comma + 1 + text.length;
      continue;
    }
    const nl = stream.indexOf('\n', j);
    const body = stream.slice(j, nl < 0 ? undefined : nl);
    try {
      rows.set(id, JSON.parse(body));
    } catch {
      /* import/hint sətirləri, lazım deyil */
    }
    i = nl < 0 ? stream.length : nl + 1;
  }
  return rows;
}

function makeResolver(rows) {
  const resolveRef = (v, depth = 0) => {
    if (depth > 60) return v;
    if (typeof v === 'string' && /^\$[0-9a-f]+$/.test(v)) {
      const r = rows.get(v.slice(1));
      return r === undefined ? v : resolveRef(r, depth + 1);
    }
    if (Array.isArray(v)) return v.map((x) => resolveRef(x, depth + 1));
    if (v && typeof v === 'object') {
      const o = {};
      for (const k in v) o[k] = resolveRef(v[k], depth + 1);
      return o;
    }
    return v;
  };
  return resolveRef;
}

/* ---------- əsas məntiq ---------- */

function imageOf(p) {
  if (!p) return null;
  const media = Array.isArray(p.media) ? p.media[0] : null;
  const urls = (media && media.urls) || p.image || null;
  if (!media || !media.uuid || !urls) return null;
  const { uuid, dimensions = {}, blur_hash } = media;
  return {
    card: `https://cdn-2.clopos.com/clockcoffee/${uuid}/card43@2x.webp`,
    cardJpg: `https://cdn-2.clopos.com/clockcoffee/${uuid}/card43@2x.jpg`,
    large: urls.extra_large || urls.original_large || urls.original,
    thumb: urls.thumb || null,
    w: dimensions.width || null,
    h: dimensions.height || null,
    blurHash: blur_hash || null,
  };
}

export function parseMenuHtml(html, source = DEFAULT_MENU_URL) {
  const rows = parseRows(extractRscStream(html));
  const resolveRef = makeResolver(rows);

  const categories = new Map();
  const products = new Map();
  let brand = null;
  let logo = null;

  for (const value of rows.values()) {
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (!Array.isArray(x)) {
        if ('price' in x && 'category_id' in x && 'name' in x && x.id != null) {
          if (!products.has(x.id)) products.set(x.id, x);
        } else if ('products_count' in x && 'name' in x && x.id != null) {
          if (!categories.has(x.id)) categories.set(x.id, x);
        } else if ('brand_name' in x && 'address_address' in x && !brand) {
          brand = x;
        } else if ('logo' in x && 'brand' in x && !logo) {
          logo = x.logo;
        }
      }
      for (const k in x) walk(x[k]);
    };
    walk(value);
  }
  if (!products.size) throw new Error('Məhsul tapılmadı (səhifə strukturu dəyişib?)');

  // Kateqoriyaları bölmələrə (section) qruplaşdırırıq: "SALATLAR" + "SALATLAR T" birlikdə salatlar olur
  const sections = new Map();
  const sortedCats = [...categories.values()]
    .filter((c) => !c.hidden && !c.emenu_hidden)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  for (const c of sortedCats) {
    const key = sectionKey(c.name);
    if (SKIP_SECTIONS.has(key)) continue;
    if (!sections.has(key)) {
      const hours = c.name.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      sections.set(key, {
        key: key.replace(/\s+/g, '-'),
        title: SECTION_TITLES[key] || capitalize(stripTags(c.name).replace(/\s+T$/, '').toLocaleLowerCase('az')),
        note: hours ? `${hours[1]}-${hours[2]}` : null,
        timerCats: new Set(),
        regularCats: new Set(),
      });
    }
    const s = sections.get(key);
    (isTimerCategory(c.name) ? s.timerCats : s.regularCats).add(c.id);
  }

  const all = [...products.values()].map((p) => resolveRef(p));
  const byCat = new Map();
  for (const p of all) {
    if (!byCat.has(p.category_id)) byCat.set(p.category_id, []);
    byCat.get(p.category_id).push(p);
  }

  const out = [];
  for (const s of sections.values()) {
    const timerItems = [...s.timerCats].flatMap((id) => byCat.get(id) || []);
    const regularItems = [...s.regularCats].flatMap((id) => byCat.get(id) || []);
    const usedRegular = new Set();

    const findRegular = (tp) => {
      const key = productKey(tp.name);
      const img = tp.media?.[0]?.uuid;
      const desc = fold(tp.meta?.langs?.az?.description || '').slice(0, 30);
      const pool = regularItems.filter((r) => !usedRegular.has(r.id));
      return (
        pool.find((r) => productKey(r.name) === key) ||
        (img && pool.find((r) => r.media?.[0]?.uuid === img)) ||
        pool.find((r) => productKey(r.meta?.langs?.az?.name) === key) ||
        (desc.length > 12 && pool.find((r) => fold(r.meta?.langs?.az?.description || '').slice(0, 30) === desc)) ||
        null
      );
    };

    const items = [];
    const toItem = (tp, rp) => {
      const src = tp || rp;
      const azName = src.meta?.langs?.az?.name;
      const rawName = azName && !/^\s*ümumi kalori/i.test(azName) ? azName : src.name;
      return {
        id: src.id,
        name: capitalize(stripTags(rawName)),
        desc: cleanDesc(tp?.meta?.langs?.az?.description || rp?.meta?.langs?.az?.description || src.description || ''),
        kcal: parseKcal(tp?.meta?.langs?.az?.name, rp?.meta?.langs?.az?.name, tp?.name, rp?.name),
        timer: tp ? Number(tp.price) : null,
        regular: rp ? Number(rp.price) : null,
        img: imageOf(tp) || (rp && imageOf(rp)) || null,
      };
    };

    for (const tp of timerItems) {
      const rp = findRegular(tp);
      if (rp) usedRegular.add(rp.id);
      items.push(toItem(tp, rp));
    }
    for (const rp of regularItems) if (!usedRegular.has(rp.id)) items.push(toItem(null, rp));

    if (items.length) {
      out.push({ key: s.key, title: s.title, note: s.note, items });
    }
  }

  return {
    source,
    fetchedAt: new Date().toISOString(),
    currency: brand?.currency || '₼',
    brand: brand
      ? {
          name: brand.brand_name,
          address: brand.address_address,
          phone: brand.address_phone,
          logo: logo?.urls?.original || null,
        }
      : null,
    sections: out,
    stats: {
      sections: out.length,
      products: out.reduce((n, s) => n + s.items.length, 0),
      withTimer: out.reduce((n, s) => n + s.items.filter((i) => i.timer != null).length, 0),
    },
  };
}

export async function scrapeMenu(url = DEFAULT_MENU_URL, { timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'az,en;q=0.8',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`Menyu səhifəsi ${res.status} qaytardı`);
    return parseMenuHtml(await res.text(), url);
  } finally {
    clearTimeout(timer);
  }
}

export async function saveMenu(menu, path = MENU_JSON_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(menu, null, 2) + '\n', 'utf8');
  return path;
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.argv[2] || DEFAULT_MENU_URL;
  console.log(`Menyu yüklənir: ${url}`);
  try {
    const menu = await scrapeMenu(url);
    const path = await saveMenu(menu);
    for (const s of menu.sections) {
      const t = s.items.filter((i) => i.timer != null).length;
      console.log(`  ${s.title.padEnd(22)} ${String(s.items.length).padStart(3)} məhsul  (${t} timer qiyməti)`);
    }
    console.log(`${menu.stats.products} məhsul yazıldı: ${path}`);
  } catch (err) {
    console.error('✗ Scraper xətası:', err.message);
    process.exitCode = 1;
  }
}
