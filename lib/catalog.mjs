/**
 * Sayt konfiqurasiyası (admin paneldən idarə olunur):
 *   cc:config          JSON  { tabs, custom, prices, content, settings, updatedAt }
 *   cc:img:<id>        şəkil (data URL), əl ilə əlavə olunan məhsullar üçün
 *   cc:log             son admin əməliyyatları
 * Qiymətlər Clopos-dan gəlir; paneldə dəyişdirilən məhsul `prices` siyahısında saxlanılır
 * və saytda Clopos qiymətinin yerinə göstərilir (bir klikə geri qaytarmaq olur).
 */
import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS, TABS, fold } from '../assets/js/site-defaults.js';
import { scrapeMenu } from '../scripts/scrape-menu.mjs';
import { cmd, run, storeKind } from './store.mjs';

const CONFIG_KEY = 'cc:config';
const LOG_KEY = 'cc:log';
const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t]));
const MAX_IMAGE = 1_500_000;

/* ---------- Clopos menyusu (yaddaşda 10 dəqiqə keşlənir) ---------- */
let menuCache = { at: 0, data: null };
export async function cloposMenu() {
  if (menuCache.data && Date.now() - menuCache.at < 10 * 60e3) return menuCache.data;
  const data = await scrapeMenu();
  menuCache = { at: Date.now(), data };
  return data;
}

/* ---------- konfiqurasiya ---------- */
function normalize(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    tabs: c.tabs && typeof c.tabs === 'object' ? c.tabs : {},
    custom: c.custom && typeof c.custom === 'object' ? c.custom : {},
    prices: c.prices && typeof c.prices === 'object' ? c.prices : {},
    content: c.content && typeof c.content === 'object' ? c.content : {},
    settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) },
    updatedAt: c.updatedAt || null,
  };
}

export async function getConfig() {
  if (storeKind() === 'none') return normalize(null);
  const raw = await cmd('GET', CONFIG_KEY);
  try {
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return normalize(null);
  }
}

async function saveConfig(cfg, logText) {
  cfg.updatedAt = new Date().toISOString();
  await run([
    ['SET', CONFIG_KEY, JSON.stringify(cfg)],
    ['LPUSH', LOG_KEY, JSON.stringify({ at: cfg.updatedAt, text: logText })],
    ['LTRIM', LOG_KEY, 0, 99],
  ]);
  return cfg;
}

export async function logEvent(text) {
  if (storeKind() === 'none') return;
  await run([
    ['LPUSH', LOG_KEY, JSON.stringify({ at: new Date().toISOString(), text })],
    ['LTRIM', LOG_KEY, 0, 99],
  ]);
}

export async function getLog(limit = 60) {
  const rows = await cmd('LRANGE', LOG_KEY, 0, limit - 1);
  return (rows || []).map((r) => {
    try {
      return JSON.parse(r);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/* ---------- köməkçilər ---------- */
const publicCustom = (p) => ({
  id: p.id,
  name: p.name,
  desc: p.desc || '',
  kcal: p.kcal || null,
  timer: p.timer ?? null,
  regular: p.regular ?? null,
  tab: p.tab,
  img: p.img ? { card: p.img, large: p.img } : null,
  custom: true,
});

/** Tab üçün standart seçim (admin heç nə dəyişməyibsə): TABS.pick adlarını Clopos ID-lərinə çevirir */
function defaultIds(tab, menu) {
  const pool = (menu?.sections || []).filter((s) => tab.sections.includes(s.key)).flatMap((s) => s.items);
  if (!tab.pick.length) return pool.map((i) => String(i.id));
  return tab.pick.map((n) => pool.find((i) => fold(i.name) === fold(n))).filter(Boolean).map((i) => String(i.id));
}

/* ---------- ictimai (sayt üçün) ---------- */
export async function publicSite() {
  const cfg = await getConfig();
  return {
    tabs: cfg.tabs,
    custom: Object.values(cfg.custom).map(publicCustom),
    prices: cfg.prices,
    content: cfg.content,
    settings: cfg.settings,
    updatedAt: cfg.updatedAt,
  };
}

/* ---------- admin: bütün kataloq ---------- */
export async function adminCatalog() {
  const [cfg, menu] = await Promise.all([getConfig(), cloposMenu().catch(() => null)]);
  const tabs = TABS.map((t) => {
    const pool = (menu?.sections || [])
      .filter((s) => t.sections.includes(s.key))
      .flatMap((s) =>
        s.items.map((i) => {
          const over = cfg.prices[String(i.id)] || null;
          return {
            ...i,
            id: String(i.id),
            source: 'clopos',
            section: s.title,
            clopos: { timer: i.timer ?? null, regular: i.regular ?? null },
            timer: over && over.timer != null ? over.timer : i.timer ?? null,
            regular: over && over.regular != null ? over.regular : i.regular ?? null,
            edited: Boolean(over),
          };
        }),
      );
    const custom = Object.values(cfg.custom).filter((p) => p.tab === t.id).map((p) => ({ ...publicCustom(p), source: 'custom' }));
    const selected = Array.isArray(cfg.tabs[t.id]) ? cfg.tabs[t.id].map(String) : defaultIds(t, menu).concat(custom.map((p) => p.id));
    return { id: t.id, title: t.title, customized: Array.isArray(cfg.tabs[t.id]), selected, products: [...custom, ...pool] };
  });
  return {
    tabs,
    settings: cfg.settings,
    updatedAt: cfg.updatedAt,
    content: cfg.content,
    priceCount: Object.keys(cfg.prices).length,
    menuFetchedAt: menu?.fetchedAt || null,
    cloposCount: menu?.stats?.products || 0,
    customCount: Object.keys(cfg.custom).length,
  };
}

/* ---------- admin: dəyişikliklər ---------- */
const bad = (message) => Object.assign(new Error(message), { status: 400 });

function price(v, label) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw bad(`${label} düzgün deyil`);
  return n;
}

async function ensureTabList(cfg, tabId) {
  if (Array.isArray(cfg.tabs[tabId])) return cfg.tabs[tabId];
  const menu = await cloposMenu().catch(() => null);
  const customIds = Object.values(cfg.custom).filter((p) => p.tab === tabId).map((p) => p.id);
  cfg.tabs[tabId] = [...defaultIds(TAB_BY_ID[tabId], menu), ...customIds];
  return cfg.tabs[tabId];
}

export async function saveProduct(input) {
  const b = input || {};
  const name = String(b.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw bad('Məhsulun adı 2-80 simvol olmalıdır');
  if (!TAB_BY_ID[b.tab]) throw bad('Kateqoriya seçilməyib');
  const timer = price(b.timer, 'Timer qiyməti');
  const regular = price(b.regular, 'Adi qiymət');
  if (timer === null && regular === null) throw bad('Ən azı bir qiymət yazın');
  const kcal = b.kcal === '' || b.kcal == null ? null : Math.round(Number(b.kcal));
  if (kcal !== null && (!Number.isFinite(kcal) || kcal < 0 || kcal > 5000)) throw bad('Kalori düzgün deyil');
  const desc = String(b.desc || '').trim().slice(0, 220);

  const cfg = await getConfig();
  const existing = b.id && cfg.custom[b.id];
  if (b.id && !existing) throw bad('Məhsul tapılmadı');
  const id = existing ? existing.id : `c${randomBytes(5).toString('hex')}`;
  const product = { id, name, desc, tab: b.tab, timer, regular, kcal, img: existing?.img || null, createdAt: existing?.createdAt || new Date().toISOString() };

  const commands = [];
  if (typeof b.image === 'string' && b.image.startsWith('data:')) {
    if (!/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(b.image)) throw bad('Şəkil formatı dəstəklənmir');
    if (b.image.length > MAX_IMAGE) throw bad('Şəkil çox böyükdür');
    const v = createHash('sha1').update(b.image).digest('hex').slice(0, 10);
    commands.push(['SET', `cc:img:${id}`, b.image]);
    product.img = `/api/img?id=${id}&v=${v}`;
  } else if (b.image === null) {
    commands.push(['DEL', `cc:img:${id}`]);
    product.img = null;
  }
  if (commands.length) await run(commands);

  // yeni məhsul və ya kateqoriya dəyişibsə: köhnə tabdan çıxar, yenisinin sonuna əlavə et
  if (existing && existing.tab !== b.tab && Array.isArray(cfg.tabs[existing.tab])) {
    cfg.tabs[existing.tab] = cfg.tabs[existing.tab].filter((x) => x !== id);
  }
  cfg.custom[id] = product;
  const list = await ensureTabList(cfg, b.tab);
  if (!list.includes(id)) list.push(id);

  await saveConfig(cfg, existing ? `Məhsul yeniləndi: ${name}` : `Yeni məhsul əlavə edildi: ${name}`);
  return publicCustom(product);
}

export async function deleteProduct(id) {
  const cfg = await getConfig();
  const p = cfg.custom[id];
  if (!p) throw bad('Məhsul tapılmadı');
  delete cfg.custom[id];
  for (const t of Object.keys(cfg.tabs)) cfg.tabs[t] = cfg.tabs[t].filter((x) => x !== id);
  await cmd('DEL', `cc:img:${id}`);
  await saveConfig(cfg, `Məhsul silindi: ${p.name}`);
  return { ok: true };
}

export async function setVisibility(tabId, id, on, label = '') {
  if (!TAB_BY_ID[tabId]) throw bad('Kateqoriya tapılmadı');
  const cfg = await getConfig();
  const list = await ensureTabList(cfg, tabId);
  const sid = String(id);
  const has = list.includes(sid);
  if (on && !has) list.push(sid);
  if (!on && has) cfg.tabs[tabId] = list.filter((x) => x !== sid);
  await saveConfig(cfg, `${on ? 'Saytda göstərildi' : 'Saytdan gizlədildi'}: ${label || sid} (${TAB_BY_ID[tabId].title})`);
  return { ok: true, selected: cfg.tabs[tabId] };
}

export async function reorder(tabId, ids) {
  if (!TAB_BY_ID[tabId] || !Array.isArray(ids)) throw bad('Sıralama düzgün deyil');
  const cfg = await getConfig();
  const list = await ensureTabList(cfg, tabId);
  const next = ids.map(String).filter((x) => list.includes(x));
  if (next.length !== list.length) throw bad('Sıralama siyahısı uyğun gəlmir');
  cfg.tabs[tabId] = next;
  await saveConfig(cfg, `Sıralama dəyişdi: ${TAB_BY_ID[tabId].title}`);
  return { ok: true };
}

export async function resetTab(tabId) {
  if (!TAB_BY_ID[tabId]) throw bad('Kateqoriya tapılmadı');
  const cfg = await getConfig();
  delete cfg.tabs[tabId];
  await saveConfig(cfg, `Standart seçimə qaytarıldı: ${TAB_BY_ID[tabId].title}`);
  return { ok: true };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function saveSettings(input) {
  const b = input || {};
  const firstHour = price(b.firstHour, 'İlk saat tarifi');
  const extraHour = price(b.extraHour, 'Növbəti saat tarifi');
  if (firstHour === null || extraHour === null) throw bad('Tarifləri yazın');
  if (!TIME.test(b.open || '') || !TIME.test(b.close || '')) throw bad('İş saatlarını SS:DD formatında yazın');
  const announcement = String(b.announcement || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  const cfg = await getConfig();
  cfg.settings = { firstHour, extraHour, open: b.open, close: b.close, announcementOn: Boolean(b.announcementOn) && announcement.length > 0, announcement };
  await saveConfig(cfg, 'Parametrlər yeniləndi');
  return cfg.settings;
}

/** Bir məhsulun qiymətini paneldən dəyişir (Clopos məhsulunda üstün qiymət kimi saxlanılır) */
export async function savePrice(input) {
  const b = input || {};
  const id = String(b.id || '').trim();
  if (!id) throw bad('Məhsul seçilməyib');
  const timer = price(b.timer, 'Timer qiyməti');
  const regular = price(b.regular, 'Adi qiymət');
  const cfg = await getConfig();

  // əl ilə əlavə olunan məhsulun qiyməti öz kartında saxlanılır
  if (cfg.custom[id]) {
    if (timer === null && regular === null) throw bad('Ən azı bir qiymət yazın');
    cfg.custom[id] = { ...cfg.custom[id], timer, regular };
    await saveConfig(cfg, `Qiymət dəyişdi: ${cfg.custom[id].name}`);
    return { id, timer, regular, edited: true };
  }

  const menu = await cloposMenu().catch(() => null);
  const item = (menu?.sections || []).flatMap((s) => s.items).find((i) => String(i.id) === id);
  if (!item) throw bad('Məhsul tapılmadı');
  if (timer === null && regular === null) {
    delete cfg.prices[id];
    await saveConfig(cfg, `Qiymət Clopos-a qaytarıldı: ${item.name}`);
    return { id, timer: item.timer ?? null, regular: item.regular ?? null, edited: false };
  }
  cfg.prices[id] = { timer, regular };
  await saveConfig(cfg, `Qiymət dəyişdi: ${item.name}`);
  return { id, timer, regular, edited: true };
}

// Saytdakı mətnlər. Standart mətnlər index.html-dədir, burada yalnız dəyişilənlər saxlanılır.
const CONTENT_KEY = /^[a-z][\w.-]{1,59}$/i;
export async function saveContent(input) {
  const raw = input && typeof input === 'object' ? input.content : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('Mətnlər düzgün göndərilmədi');
  const entries = Object.entries(raw);
  if (entries.length > 400) throw bad('Mətn sahələri çox çoxdur');
  const content = {};
  for (const [key, value] of entries) {
    if (!CONTENT_KEY.test(key)) throw bad(`Açar düzgün deyil: ${key}`);
    const v = String(value ?? '').split(String.fromCharCode(13)).join('').trim();
    if (!v) continue;
    if (v.length > 2000) throw bad('Mətn çox uzundur (2000 simvol)');
    content[key] = v;
  }
  if (JSON.stringify(content).length > 60000) throw bad('Mətnlərin ümumi həcmi çox böyükdür');
  const cfg = await getConfig();
  const changed = Object.keys({ ...cfg.content, ...content }).filter((k) => cfg.content[k] !== content[k]).length;
  cfg.content = content;
  await saveConfig(cfg, changed ? `Sayt mətnləri yeniləndi (${changed} sahə)` : 'Sayt mətnləri yoxlanıldı');
  return { ok: true, count: Object.keys(content).length };
}

export async function getImage(id) {
  if (!/^c[0-9a-f]{10}$/.test(String(id))) return null;
  const data = await cmd('GET', `cc:img:${id}`);
  const m = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(data || '');
  return m ? { type: m[1], buffer: Buffer.from(m[2], 'base64') } : null;
}
