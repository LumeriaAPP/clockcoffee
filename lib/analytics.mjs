/*
 * Anonim, yüngül statistika. Şəxsi məlumat və IP saxlanmır: brauzer təsadüfi ID
 * (localStorage) göndərir, unikal ziyarətçilər HyperLogLog ilə sayılır.
 *
 * Açarlar (Bakı vaxtı ilə gün):
 *   cc:d:<YYYY-MM-DD>   hash  views, wa, call, map, insta, fullmenu, calc, dev:*, src:*, hr:*, tab:*
 *   cc:uv:<YYYY-MM-DD>  HLL   unikal ziyarətçilər
 *   cc:live             zset  son aktivlik (hazırda saytda)
 */
import { TABS } from '../assets/js/site-defaults.js';
import { hashToObject, run } from './store.mjs';

const TZ = 'Asia/Baku';
const DAY_TTL = 400 * 86400;
const LIVE_WINDOW = 5 * 60e3;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp\/|telegram|discord|curl|wget|python-requests|node-fetch/i;
const CLICK_KINDS = new Set(['wa', 'call', 'map', 'insta', 'fullmenu']);
const TAB_IDS = new Set(TABS.map((t) => t.id));

export const COUNTERS = ['views', 'wa', 'call', 'map', 'insta', 'fullmenu', 'calc'];

export function bakuDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const bakuHour = (date = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date)) % 24;

function lastDays(n) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(bakuDay(new Date(now - i * 864e5)));
  return [...new Set(out)];
}

export function classifySource(ref = '', ua = '', utm = '', ownHost = '') {
  const u = String(utm).toLowerCase();
  if (u) {
    if (u.includes('insta') || u === 'ig') return 'Instagram';
    if (u.includes('google')) return 'Google';
    if (u.includes('whatsapp') || u === 'wa') return 'WhatsApp';
    if (u.includes('tiktok')) return 'TikTok';
    if (u.includes('facebook') || u === 'fb') return 'Facebook';
  }
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
  if (/musical_ly|TikTok/i.test(ua)) return 'TikTok';
  let host = '';
  try {
    host = new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return 'Birbaşa';
  }
  if (!host || (ownHost && host === ownHost.replace(/^www\./, ''))) return 'Birbaşa';
  if (/instagram\.com|l\.instagram/.test(host)) return 'Instagram';
  if (/(^|\.)google\./.test(host)) return 'Google';
  if (/facebook\.com|fb\.com|fb\.me/.test(host)) return 'Facebook';
  if (/wa\.me|whatsapp/.test(host)) return 'WhatsApp';
  if (/tiktok/.test(host)) return 'TikTok';
  if (/yandex|bing|duckduckgo/.test(host)) return 'Axtarış';
  return 'Digər';
}

export function classifyDevice(width, ua = '') {
  const w = Number(width) || 0;
  if (/iPad|Tablet/i.test(ua) || (w >= 700 && w < 1100 && /Mobile|Android/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua) || (w && w < 700)) return 'mobile';
  return 'desktop';
}

/** POST /api/track */
export async function track(req) {
  const b = req.body || {};
  const ua = String(req.headers['user-agent'] || '');
  const vid = String(b.vid || '');
  if (req.method !== 'POST' || BOT.test(ua) || !/^[\w-]{8,64}$/.test(vid) || req.headers['dnt'] === '1') return { status: 204 };

  const now = new Date();
  const day = bakuDay(now);
  const k = `cc:d:${day}`;
  const commands = [];

  if (b.type === 'view') {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
    commands.push(
      ['HINCRBY', k, 'views', 1],
      ['HINCRBY', k, `dev:${classifyDevice(b.w, ua)}`, 1],
      ['HINCRBY', k, `src:${classifySource(b.ref, ua, b.utm, host)}`, 1],
      ['HINCRBY', k, `hr:${bakuHour(now)}`, 1],
      ['PFADD', `cc:uv:${day}`, vid],
      ['EXPIRE', `cc:uv:${day}`, DAY_TTL],
      ['ZADD', 'cc:live', now.getTime(), vid],
    );
  } else if (b.type === 'click' && CLICK_KINDS.has(b.kind)) {
    commands.push(['HINCRBY', k, b.kind, 1]);
  } else if (b.type === 'tab' && TAB_IDS.has(b.tab)) {
    commands.push(['HINCRBY', k, `tab:${b.tab}`, 1]);
  } else if (b.type === 'calc') {
    commands.push(['HINCRBY', k, 'calc', 1]);
  } else if (b.type === 'ping') {
    commands.push(['ZADD', 'cc:live', now.getTime(), vid]);
  } else {
    return { status: 204 };
  }
  if (b.type !== 'ping') commands.push(['EXPIRE', k, DAY_TTL]);
  if (Math.random() < 0.15) commands.push(['ZREMRANGEBYSCORE', 'cc:live', 0, now.getTime() - 2 * LIVE_WINDOW]);
  await run(commands);
  return { status: 204, headers: { 'cache-control': 'no-store' } };
}

/** Admin dashboard üçün: son `range` gün + əvvəlki eyni dövr (müqayisə üçün) */
export async function stats(range = 7) {
  const r = [1, 7, 30, 90].includes(Number(range)) ? Number(range) : 7;
  const days = lastDays(r * 2);
  const cur = days.slice(-r);
  const prev = days.slice(0, days.length - r);

  const commands = cur.flatMap((d) => [['HGETALL', `cc:d:${d}`], ['PFCOUNT', `cc:uv:${d}`]]);
  commands.push(['PFCOUNT', ...cur.map((d) => `cc:uv:${d}`)]);
  prev.forEach((d) => commands.push(['HGETALL', `cc:d:${d}`]));
  commands.push(prev.length ? ['PFCOUNT', ...prev.map((d) => `cc:uv:${d}`)] : ['PFCOUNT', 'cc:uv:none']);
  commands.push(['ZCOUNT', 'cc:live', Date.now() - LIVE_WINDOW, '+inf']);
  const res = await run(commands);

  const series = [];
  const totals = Object.fromEntries(COUNTERS.map((c) => [c, 0]));
  const devices = { mobile: 0, desktop: 0, tablet: 0 };
  const sources = {};
  const hours = Array(24).fill(0);
  const tabs = Object.fromEntries(TABS.map((t) => [t.id, 0]));

  cur.forEach((d, i) => {
    const h = hashToObject(res[i * 2]);
    const visitors = Number(res[i * 2 + 1]) || 0;
    series.push({ date: d, visitors, views: h.views || 0 });
    for (const c of COUNTERS) totals[c] += h[c] || 0;
    for (const [f, v] of Object.entries(h)) {
      if (f.startsWith('dev:')) devices[f.slice(4)] = (devices[f.slice(4)] || 0) + v;
      else if (f.startsWith('src:')) sources[f.slice(4)] = (sources[f.slice(4)] || 0) + v;
      else if (f.startsWith('hr:')) hours[Number(f.slice(3))] += v;
      else if (f.startsWith('tab:') && f.slice(4) in tabs) tabs[f.slice(4)] += v;
    }
  });
  let idx = cur.length * 2;
  totals.visitors = Number(res[idx++]) || 0;

  const prevTotals = Object.fromEntries(COUNTERS.map((c) => [c, 0]));
  prev.forEach(() => {
    const h = hashToObject(res[idx++]);
    for (const c of COUNTERS) prevTotals[c] += h[c] || 0;
  });
  prevTotals.visitors = Number(res[idx++]) || 0;
  const live = Number(res[idx++]) || 0;

  return { range: r, days: series, totals, prev: prevTotals, devices, sources, hours, tabs, live, today: series[series.length - 1] || null };
}
