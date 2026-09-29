/* ==========================================================================
   Clock & Coffee admin panel
   ========================================================================== */
import { TABS, fold, hoursText } from '/assets/js/site-defaults.js';
import { MARKER_HELP, defaultValue } from '/assets/js/site-content.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const COLORS = { s1: '#2e7d4f', s2: '#4b7fd9', s3: '#b8518a', grid: '#ece6d9', axis: '#cfc7b6', surface: '#fffdf8', faint: '#bdb6a6' };
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const WEEKDAYS = ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'];
const VIEWS = { overview: 'Ümumi baxış', products: 'Məhsullar', texts: 'Sayt mətnləri', settings: 'Parametrlər', activity: 'Fəaliyyət' };
// "Mətnlər" bölməsindəki qruplar (açarın nöqtədən əvvəlki hissəsi)
const TEXT_GROUPS = [
  ['hero', 'Hero (yuxarı blok)', 'Saytı açanda görünən ilk ekran'],
  ['marquee', 'Sürüşən zolaq', 'Hero-nun altındakı hərəkətli sözlər'],
  ['manifesto', 'Konsept', 'Şəffaf qiymət bölməsi'],
  ['caesar', 'Sezar nümunəsi', 'İki qiymətin müqayisəsi'],
  ['timer', 'Timer və çek', 'Saat hekayəsi, çek və addımlar'],
  ['calc', 'Kalkulyator', 'Hesab çıxaran blok'],
  ['menu', 'Menyu bölməsi', 'Menyu başlığı və düymələr'],
  ['space', 'Məkan kartları', 'Coffee, Work, Meet'],
  ['branches', 'Filiallar bölməsi', 'Başlıq, xəritə və düymələr'],
  ['branch1', '1-ci filial', 'Abbas Səhhət'],
  ['branch2', '2-ci filial', 'Xətai'],
  ['contact', 'Əlaqə məlumatları', 'Telefon, WhatsApp və linklər: saytın hər yerində dəyişir'],
  ['cta', 'Son blok (CTA)', 'Zəng çalan saat bölməsi'],
  ['footer', 'Footer', 'Səhifənin altı'],
  ['nav', 'Naviqasiya', 'Yuxarıdakı və mobil menyu'],
];
const RANGE_TEXT = { 1: 'dünənə görə', 7: 'əvvəlki 7 günə görə', 30: 'əvvəlki 30 günə görə', 90: 'əvvəlki 90 günə görə' };
const DEVICES = [
  { key: 'mobile', label: 'Mobil', color: COLORS.s1 },
  { key: 'desktop', label: 'Kompüter', color: COLORS.s2 },
  { key: 'tablet', label: 'Planşet', color: COLORS.s3 },
];
const CLICKS = [
  { key: 'wa', label: 'WhatsApp', icon: 'a-whatsapp' },
  { key: 'call', label: 'Zəng', icon: 'a-call' },
  { key: 'map', label: 'Xəritə', icon: 'a-location' },
  { key: 'insta', label: 'Instagram', icon: 'a-insta' },
  { key: 'fullmenu', label: 'Tam menyu', icon: 'a-paper' },
  { key: 'calc', label: 'Kalkulyator', icon: 'a-chart' },
];

const state = { store: 'file', range: 7, stats: null, catalog: null, tabFilter: 'all', search: '', view: null, table: false, pendingImage: undefined, editing: null, texts: null, textSearch: '', pricing: null };

/* ---------- köməkçilər ---------- */
const num = (n) => Number(n || 0).toLocaleString('en-US');
const fld = (f, name) => f.elements.namedItem(name);
const money = (n) => (n == null ? '' : `${Number(n).toFixed(2)}₼`);
const pad = (n) => String(n).padStart(2, '0');
const dayLabel = (iso) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
};
const dateTime = (iso) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const svgIcon = (id, cls = 'i') => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(ns, 'use');
  u.setAttribute('href', `#${id}`);
  s.append(u);
  return s;
};
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(action, { method = 'GET', body, query = {} } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/admin?${qs}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-cc-admin': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* boş cavab */
  }
  if (res.status === 401 && action !== 'login') {
    showLogin({ configured: true });
    throw new ApiError('Sessiyanın vaxtı bitdi, yenidən daxil olun', 401);
  }
  if (!res.ok) throw new ApiError(data?.error || `Xəta baş verdi (${res.status})`, res.status, data?.code);
  return data;
}

function toast(message, type = 'ok') {
  const t = el('div', { class: `toast${type === 'error' ? ' toast--error' : ''}`, role: 'status' }, svgIcon(type === 'error' ? 'a-close' : 'a-tick'), el('span', { text: message }));
  $('[data-toasts]').append(t);
  setTimeout(() => t.remove(), 3200);
}

function handleError(err) {
  if (err.status === 401) return;
  if (err.code === 'STORE_MISSING') showStoreNotice();
  toast(err.message, 'error');
}

function confirmDialog(title, text, okText = 'Bəli, sil') {
  const dlg = $('[data-confirm]');
  $('[data-confirm-title]', dlg).textContent = title;
  $('[data-confirm-text]', dlg).textContent = text;
  $('button[value="ok"]', dlg).textContent = okText;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

/* ---------- tooltip ---------- */
const tip = $('[data-tip]');
function showTip(title, rows, x, y) {
  tip.replaceChildren(el('div', { class: 'tip__title', text: title }), ...rows.map((r) => el('div', { class: 'tip__row' }, r.color ? el('span', { class: 'key-line', style: `--c:${r.color}` }) : null, el('b', { text: r.value }), el('span', { text: r.label }))));
  tip.hidden = false;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.min(innerWidth - w - 12, Math.max(12, x + 16));
  const top = Math.min(innerHeight - h - 12, Math.max(12, y - h - 12));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const hideTip = () => (tip.hidden = true);

/* ==========================================================================
   Qrafiklər (SVG)
   ========================================================================== */
function niceScale(max) {
  const m = Math.max(1, max);
  const raw = m / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
  const top = Math.max(step, Math.ceil(m / step) * step);
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

function lineChart(host, { labels, series }) {
  const W = Math.max(300, host.clientWidth);
  const H = W < 520 ? 230 : 290;
  const m = { l: 40, r: 58, t: 14, b: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = labels.length;
  const { top, ticks } = niceScale(Math.max(...series.flatMap((s) => s.values)));
  const x = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => m.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));

  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${series.map((s) => s.name).join(' və ')}">`;
  for (const t of ticks) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? COLORS.axis : COLORS.grid}" stroke-width="1"/><text class="axis-text" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${num(t)}</text>`;
  labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) svg += `<text class="axis-text" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dayLabel(l)}</text>`;
  });
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (si === 0 && series.length === 1) svg += `<path d="M${pts[0]} L${pts.join(' L')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z" fill="${s.color}" opacity="0.1"/>`;
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // son nöqtələr + etiketlər (üst-üstə düşürsə etiket yazılmır, legend və tooltip kifayətdir)
  const ends = series.map((s) => ({ s, v: s.values[n - 1], y: y(s.values[n - 1]) }));
  const collide = ends.length > 1 && Math.abs(ends[0].y - ends[1].y) < 16;
  for (const e of ends) {
    svg += `<circle cx="${x(n - 1)}" cy="${e.y}" r="4.5" fill="${e.s.color}" stroke="${COLORS.surface}" stroke-width="2"/>`;
    if (!collide) svg += `<text class="end-label" x="${x(n - 1) + 10}" y="${e.y + 4}">${num(e.v)}</text>`;
  }
  svg += `<line data-cross x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="${COLORS.axis}" stroke-width="1" visibility="hidden"/>`;
  series.forEach((s, si) => (svg += `<circle data-hover="${si}" r="4.5" fill="${s.color}" stroke="${COLORS.surface}" stroke-width="2" visibility="hidden"/>`));
  svg += `<rect data-hit x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" tabindex="0"/></svg>`;
  host.innerHTML = svg;

  const root = host.firstElementChild;
  const cross = $('[data-cross]', root);
  const dots = $$('[data-hover]', root);
  const hit = $('[data-hit]', root);
  const at = (i, cx, cy) => {
    cross.setAttribute('x1', x(i));
    cross.setAttribute('x2', x(i));
    cross.setAttribute('visibility', 'visible');
    dots.forEach((d, si) => {
      d.setAttribute('cx', x(i));
      d.setAttribute('cy', y(series[si].values[i]));
      d.setAttribute('visibility', 'visible');
    });
    showTip(dayLabel(labels[i]), series.map((s) => ({ color: s.color, value: num(s.values[i]), label: s.name })), cx, cy);
  };
  const off = () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    hideTip();
  };
  let focusIdx = n - 1;
  hit.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    at(i, e.clientX, e.clientY);
  });
  hit.addEventListener('pointerleave', off);
  hit.addEventListener('blur', off);
  hit.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    focusIdx = Math.max(0, Math.min(n - 1, focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
    const r = root.getBoundingClientRect();
    at(focusIdx, r.left + (x(focusIdx) / W) * r.width, r.top + 40);
  });
}

function columnChart(host, { values, label }) {
  const W = Math.max(300, host.clientWidth);
  const H = W < 520 ? 220 : 270;
  const m = { l: 40, r: 12, t: 20, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = values.length;
  const { top, ticks } = niceScale(Math.max(...values));
  const band = iw / n;
  const bw = Math.min(24, band * 0.62);
  const y = (v) => m.t + ih - (v / top) * ih;
  const maxI = values.indexOf(Math.max(...values));
  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${label}">`;
  for (const t of ticks) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? COLORS.axis : COLORS.grid}"/><text class="axis-text" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${num(t)}</text>`;
  values.forEach((v, i) => {
    const cx = m.l + band * i + band / 2;
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, h / 2, bw / 2);
    const x0 = cx - bw / 2;
    const y0 = y(0) - h;
    if (h > 0) svg += `<path d="M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z" fill="${COLORS.s1}"/>`;
    if (i % 3 === 0) svg += `<text class="axis-text" x="${cx}" y="${H - 8}" text-anchor="middle">${pad(i)}</text>`;
    if (i === maxI && v > 0) svg += `<text class="end-label" x="${cx}" y="${y0 - 6}" text-anchor="middle">${num(v)}</text>`;
    svg += `<rect data-col="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" tabindex="0" aria-label="${pad(i)}:00, ${v} baxış"/>`;
  });
  host.innerHTML = `${svg}</svg>`;
  $$('[data-col]', host).forEach((r) => {
    const i = Number(r.dataset.col);
    const show = (cx, cy) => showTip(`${pad(i)}:00-${pad((i + 1) % 24)}:00`, [{ color: COLORS.s1, value: num(values[i]), label: 'baxış' }], cx, cy);
    r.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
    r.addEventListener('focus', () => {
      const b = r.getBoundingClientRect();
      show(b.left + b.width / 2, b.top + 40);
    });
    r.addEventListener('pointerleave', hideTip);
    r.addEventListener('blur', hideTip);
  });
}

function sparkline(values) {
  const w = 96;
  const h = 28;
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i * (w - 6)) / (n - 1) + 3).toFixed(1)},${(h - 4 - (v / max) * (h - 8)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${COLORS.faint}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="${COLORS.s1}"/></svg>`;
  return wrap.firstElementChild;
}

// ardıcıl yaşıl şkala: az olanda açıq, çox olanda tünd
function ramp(t) {
  const a = [230, 239, 231];
  const b = [22, 84, 52];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c.join(',')})`;
}

/* ==========================================================================
   Ümumi baxış
   ========================================================================== */
function deltaNode(cur, prev) {
  const span = el('span', { class: 'delta' });
  if (!prev && !cur) span.append('0%');
  else if (!prev) {
    span.classList.add('delta--up');
    span.append('▲ yeni');
  } else {
    const pct = Math.round(((cur - prev) / prev) * 100);
    span.classList.add(pct > 0 ? 'delta--up' : pct < 0 ? 'delta--down' : 'delta--flat');
    span.append(`${pct > 0 ? '▲' : pct < 0 ? '▼' : ''} ${pct > 0 ? '+' : ''}${pct}%`);
  }
  span.append(' ', el('small', { text: RANGE_TEXT[state.range] }));
  return span;
}

function renderKpis(s) {
  const tiles = [
    { label: 'Ziyarətçilər', icon: 'a-user', value: s.totals.visitors, prev: s.prev.visitors, spark: s.days.map((d) => d.visitors) },
    { label: 'Səhifə baxışı', icon: 'a-show', value: s.totals.views, prev: s.prev.views, spark: s.days.map((d) => d.views) },
    { label: 'WhatsApp klikləri', icon: 'a-whatsapp', value: s.totals.wa, prev: s.prev.wa },
    { label: 'Hazırda saytda', icon: 'a-time', value: s.live, live: true },
  ];
  $('[data-kpis]').replaceChildren(
    ...tiles.map((t) =>
      el(
        'article',
        { class: 'kpi' },
        el('p', { class: 'kpi__label' }, svgIcon(t.icon), t.label),
        el('p', { class: 'kpi__value', text: num(t.value) }),
        el(
          'div',
          { class: 'kpi__row' },
          t.live ? el('span', { class: 'delta' }, el('span', { class: 'live-dot' }), ' son 5 dəqiqə') : deltaNode(t.value, t.prev),
          t.spark && state.range > 1 ? sparkline(t.spark) : null,
        ),
      ),
    ),
  );
}

function renderMainChart(s) {
  const host = $('[data-chart]');
  const legend = $('[data-legend]');
  const table = $('[data-chart-table]');
  if (state.range === 1) {
    $('[data-chart-title]').textContent = 'Bu gün saatlar üzrə baxışlar';
    $('[data-chart-sub]').textContent = 'Bakı vaxtı';
    legend.replaceChildren();
    columnChart(host, { values: s.hours, label: 'Saatlar üzrə baxışlar' });
    table.replaceChildren(
      el('table', { class: 'datatable' }, el('thead', {}, el('tr', {}, el('th', { text: 'Saat' }), el('th', { text: 'Baxış' }))), el('tbody', {}, s.hours.map((v, i) => el('tr', {}, el('td', { text: `${pad(i)}:00` }), el('td', { text: num(v) }))))),
    );
  } else {
    $('[data-chart-title]').textContent = 'Ziyarətçilər və baxışlar';
    $('[data-chart-sub]').textContent = `Son ${state.range} gün`;
    const series = [
      { name: 'Ziyarətçi', color: COLORS.s1, values: s.days.map((d) => d.visitors) },
      { name: 'Baxış', color: COLORS.s2, values: s.days.map((d) => d.views) },
    ];
    legend.replaceChildren(...series.map((x) => el('span', {}, el('i', { class: 'key-line', style: `--c:${x.color}` }), x.name)));
    lineChart(host, { labels: s.days.map((d) => d.date), series });
    table.replaceChildren(
      el(
        'table',
        { class: 'datatable' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Tarix' }), el('th', { text: 'Ziyarətçi' }), el('th', { text: 'Baxış' }))),
        el('tbody', {}, [...s.days].reverse().map((d) => el('tr', {}, el('td', { text: dayLabel(d.date) }), el('td', { text: num(d.visitors) }), el('td', { text: num(d.views) })))),
      ),
    );
  }
  host.hidden = state.table;
  table.hidden = !state.table;
}

function emptyNode(title, text) {
  return el('div', { class: 'empty' }, el('b', { text: title }), el('span', { text }));
}

function renderDevices(s) {
  const total = DEVICES.reduce((n, d) => n + (s.devices[d.key] || 0), 0);
  const host = $('[data-devices]');
  if (!total) return host.replaceChildren(emptyNode('Hələ məlumat yoxdur', 'Ziyarətlər gəldikcə burada görünəcək'));
  host.replaceChildren(
    el('div', { class: 'stackbar', role: 'img', 'aria-label': DEVICES.map((d) => `${d.label} ${s.devices[d.key] || 0}`).join(', ') }, DEVICES.filter((d) => s.devices[d.key]).map((d) => el('span', { style: `--c:${d.color};width:${((s.devices[d.key] / total) * 100).toFixed(2)}%` }))),
    el(
      'div',
      { class: 'rows' },
      DEVICES.map((d) => el('div', { class: 'row-kv' }, el('i', { class: 'key-dot', style: `--c:${d.color}` }), el('span', { text: d.label }), el('b', { text: num(s.devices[d.key] || 0) }), el('small', { text: `${Math.round(((s.devices[d.key] || 0) / total) * 100)}%` }))),
    ),
  );
}

function barList(host, rows, emptyText) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!max) return host.replaceChildren(emptyNode('Hələ məlumat yoxdur', emptyText));
  host.replaceChildren(
    el(
      'div',
      { class: 'bars' },
      rows.map((r) =>
        el(
          'div',
          { class: 'bar' },
          el('span', { class: 'bar__label' }, r.icon ? svgIcon(r.icon) : null, el('span', { text: r.label })),
          el('span', { class: 'bar__track' }, el('span', { class: 'bar__fill', style: `width:${Math.max(1, (r.value / max) * 82)}%` }), el('span', { class: 'bar__value', text: num(r.value) })),
        ),
      ),
    ),
  );
}

function renderHours(s) {
  const host = $('[data-hours]');
  const max = Math.max(0, ...s.hours);
  if (!max) return host.replaceChildren(emptyNode('Hələ məlumat yoxdur', 'Hansı saatlarda daha çox baxıldığı burada görünəcək'));
  const peak = s.hours.indexOf(max);
  const heat = el(
    'div',
    { class: 'heat', role: 'list' },
    s.hours.map((v, i) => {
      const cell = el('span', { class: 'heat__cell', role: 'listitem', tabindex: '0', style: `--c:${v ? ramp(0.12 + (v / max) * 0.88) : '#efeae0'}`, 'aria-label': `${pad(i)}:00, ${v} baxış` });
      const show = (x, y) => showTip(`${pad(i)}:00-${pad((i + 1) % 24)}:00`, [{ color: COLORS.s1, value: num(v), label: 'baxış' }], x, y);
      cell.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
      cell.addEventListener('focus', () => {
        const b = cell.getBoundingClientRect();
        show(b.left, b.top);
      });
      cell.addEventListener('pointerleave', hideTip);
      cell.addEventListener('blur', hideTip);
      return cell;
    }),
  );
  host.replaceChildren(
    heat,
    el('div', { class: 'heat__axis', 'aria-hidden': 'true' }, ['00', '06', '12', '18'].map((t) => el('span', { text: t }))),
    el('p', { class: 'heat__peak' }, 'Ən aktiv saat: ', el('b', { text: `${pad(peak)}:00-${pad((peak + 1) % 24)}:00` }), ` (${num(max)} baxış)`),
  );
}

function renderOverview() {
  const s = state.stats;
  if (!s) return;
  renderKpis(s);
  renderMainChart(s);
  renderDevices(s);
  const sources = Object.entries(s.sources).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 7);
  barList($('[data-sources]'), sources, 'Instagram, Google və digər mənbələr burada görünəcək');
  renderHours(s);
  barList($('[data-clicks]'), CLICKS.map((c) => ({ ...c, value: s.totals[c.key] || 0 })), 'WhatsApp, zəng və xəritə klikləri burada görünəcək');
  barList($('[data-tabs]'), TABS.map((t) => ({ label: t.title, value: s.tabs[t.id] || 0 })).sort((a, b) => b.value - a.value), 'Menyuda hansı bölmələrə baxıldığı burada görünəcək');
}

async function loadStats() {
  $$('#overview-busy, [data-view="overview"] [data-busy], [data-kpis]').forEach((n) => n.classList.add('is-busy'));
  try {
    state.stats = await api('stats', { query: { range: state.range } });
    renderOverview();
    const d = new Date();
    $('[data-stats-meta]').textContent = `Yeniləndi: ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (err) {
    handleError(err);
  } finally {
    $$('[data-view="overview"] .is-busy, [data-kpis].is-busy').forEach((n) => n.classList.remove('is-busy'));
  }
}

/* ==========================================================================
   Məhsullar
   ========================================================================== */
const TAB_TITLES = Object.fromEntries(TABS.map((t) => [t.id, t.title]));

function productRow(tab, p, { selected, index, total }) {
  const img = p.img?.thumb || p.img?.card || p.img?.large;
  const thumb = img ? el('img', { class: 'prow__img', src: img, alt: '', loading: 'lazy' }) : el('span', { class: 'prow__img prow__img--empty' }, svgIcon('a-image'));
  const toggle = el('input', { type: 'checkbox', 'aria-label': `${p.name}: saytda göstər` });
  toggle.checked = selected;
  toggle.addEventListener('change', () => setVisibility(tab, p, toggle.checked));
  const canOrder = selected && !state.search;
  return el(
    'div',
    { class: `prow${selected ? '' : ' is-off'}` },
    thumb,
    el(
      'div',
      { class: 'prow__main' },
      el('p', { class: 'prow__name' }, el('span', { text: p.name }), el('em', { class: `badge ${p.source === 'custom' ? 'badge--custom' : 'badge--clopos'}`, text: p.source === 'custom' ? 'Əl ilə' : 'Clopos' })),
      el('p', { class: 'prow__desc', text: p.desc || (p.kcal ? `${p.kcal} kkal` : '') }),
    ),
    el(
      'button',
      {
        type: 'button',
        class: `prow__price${p.edited ? ' is-edited' : ''}`,
        title: p.edited ? 'Qiymət paneldə dəyişdirilib' : 'Qiyməti dəyiş',
        onclick: () => (p.source === 'custom' ? openDrawer(p) : openPrice(p)),
      },
      el('b', { text: p.timer != null ? money(p.timer) : money(p.regular) }),
      el('small', { text: p.timer != null && p.regular != null ? `adi ${money(p.regular)}` : p.timer == null ? 'yalnız adi' : '' }),
    ),
    el(
      'div',
      { class: 'prow__order' },
      canOrder ? el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Yuxarı', disabled: index === 0, onclick: () => move(tab, index, -1) }, svgIcon('a-up')) : null,
      canOrder ? el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Aşağı', disabled: index === total - 1, onclick: () => move(tab, index, 1) }, svgIcon('a-down')) : null,
    ),
    el(
      'div',
      { class: 'prow__actions' },
      p.source === 'custom' ? el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Redaktə et', onclick: () => openDrawer(p) }, svgIcon('a-edit')) : null,
      el('label', { class: 'switch', title: selected ? 'Saytda göstərilir' : 'Saytda gizlidir' }, toggle, el('span', { class: 'switch__track' }, el('span', { class: 'switch__thumb' }))),
    ),
  );
}

function renderProducts() {
  const c = state.catalog;
  if (!c) return;
  const filter = $('[data-tab-filter]');
  filter.replaceChildren(
    ...[{ id: 'all', title: 'Hamısı' }, ...TABS].map((t) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(state.tabFilter === t.id), onclick: () => ((state.tabFilter = t.id), renderProducts()) }, t.title),
    ),
  );
  const shown = c.tabs.reduce((n, t) => n + t.selected.length, 0);
  $('[data-summary]').replaceChildren(
    el('span', { class: 'pill' }, 'Saytda ', el('b', { text: String(shown) })),
    el('span', { class: 'pill' }, 'Clopos menyusunda ', el('b', { text: String(c.cloposCount) })),
    el('span', { class: 'pill' }, 'Əl ilə əlavə ', el('b', { text: String(c.customCount) })),
    c.menuFetchedAt ? el('span', { class: 'pill' }, 'Qiymətlər: ', el('b', { text: dateTime(c.menuFetchedAt) })) : null,
  );

  const q = fold(state.search);
  const match = (p) => !q || fold(p.name).includes(q) || fold(p.desc).includes(q);
  const groups = c.tabs
    .filter((t) => state.tabFilter === 'all' || t.id === state.tabFilter)
    .map((t) => {
      const byId = new Map(t.products.map((p) => [p.id, p]));
      const selected = t.selected.map((id) => byId.get(id)).filter(Boolean);
      const others = t.products.filter((p) => !t.selected.includes(p.id));
      const sel = selected.filter(match);
      const oth = others.filter(match);
      if (q && !sel.length && !oth.length) return null;
      return el(
        'article',
        { class: 'card group' },
        el(
          'header',
          { class: 'group__head' },
          el('h3', { text: t.title }),
          el('span', { class: 'group__count', text: `${selected.length} məhsul saytda` }),
          t.customized ? el('button', { type: 'button', class: 'linkbtn', onclick: () => resetTab(t) }, 'Standarta qaytar') : null,
        ),
        sel.length ? el('div', { class: 'plist' }, sel.map((p) => productRow(t, p, { selected: true, index: selected.indexOf(p), total: selected.length }))) : el('p', { class: 'empty', text: q ? 'Axtarışa uyğun məhsul saytda yoxdur' : 'Bu bölmədə saytda göstərilən məhsul yoxdur' }),
        oth.length
          ? el('details', { class: 'more', open: q ? true : null }, el('summary', {}, `Saytda göstərilməyənlər (${oth.length})`), el('div', { class: 'plist' }, oth.map((p) => productRow(t, p, { selected: false }))))
          : null,
      );
    })
    .filter(Boolean);
  $('[data-groups]').replaceChildren(...(groups.length ? groups : [emptyNode('Heç nə tapılmadı', 'Axtarış sözünü dəyişin')]));
}

async function loadCatalog() {
  $('[data-groups]').classList.add('is-busy');
  try {
    state.catalog = await api('catalog');
    renderProducts();
  } catch (err) {
    handleError(err);
  } finally {
    $('[data-groups]').classList.remove('is-busy');
  }
}

async function setVisibility(tab, p, on) {
  const before = tab.selected.slice();
  tab.selected = on ? [...tab.selected, p.id] : tab.selected.filter((x) => x !== p.id);
  tab.customized = true;
  renderProducts();
  try {
    const r = await api('visibility', { method: 'POST', body: { tab: tab.id, id: p.id, on, label: p.name } });
    tab.selected = r.selected.map(String);
    renderProducts();
    toast(on ? `${p.name} saytda göstərilir` : `${p.name} saytdan gizlədildi`);
  } catch (err) {
    tab.selected = before;
    renderProducts();
    handleError(err);
  }
}

async function move(tab, index, dir) {
  const ids = tab.selected.slice();
  const j = index + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[index], ids[j]] = [ids[j], ids[index]];
  const before = tab.selected;
  tab.selected = ids;
  renderProducts();
  try {
    await api('reorder', { method: 'POST', body: { tab: tab.id, ids } });
  } catch (err) {
    tab.selected = before;
    renderProducts();
    handleError(err);
  }
}

async function resetTab(tab) {
  if (!(await confirmDialog('Standart seçimə qaytarılsın?', `"${tab.title}" bölməsində əl ilə etdiyiniz seçim və sıralama silinəcək. Əl ilə əlavə etdiyiniz məhsullar silinmir.`, 'Qaytar'))) return;
  try {
    await api('reset', { method: 'POST', body: { tab: tab.id } });
    toast('Standart seçimə qaytarıldı');
    loadCatalog();
  } catch (err) {
    handleError(err);
  }
}

/* ---------- məhsul formu ---------- */
const drawer = $('[data-drawer]');
const form = $('[data-product-form]');

function setPreview(src) {
  const img = $('[data-preview]');
  img.hidden = !src;
  if (src) img.src = src;
  else img.removeAttribute('src');
  $('[data-upload-empty]').hidden = Boolean(src);
  $('[data-upload-actions]').hidden = !src;
}

function openDrawer(p = null) {
  state.editing = p;
  state.pendingImage = undefined;
  form.reset();
  $('[data-form-error]').textContent = '';
  $('[data-drawer-title]').textContent = p ? 'Məhsulu redaktə et' : 'Yeni məhsul';
  $('[data-tab-select]').replaceChildren(...TABS.map((t) => el('option', { value: t.id, text: t.title })));
  if (p) {
    fld(form, 'name').value = p.name;
    fld(form, 'tab').value = p.tab;
    fld(form, 'desc').value = p.desc || '';
    fld(form, 'timer').value = p.timer ?? '';
    fld(form, 'regular').value = p.regular ?? '';
    fld(form, 'kcal').value = p.kcal ?? '';
  } else if (state.tabFilter !== 'all') fld(form, 'tab').value = state.tabFilter;
  setPreview(p?.img?.card || null);
  $('[data-delete-product]').hidden = !p;
  drawer.hidden = false;
  setTimeout(() => fld(form, 'name').focus(), 50);
}
const closeDrawer = () => (drawer.hidden = true);

async function processImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Yalnız şəkil faylı seçin');
  if (file.size > 15e6) throw new Error('Şəkil 15 MB-dan böyükdür');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Şəkil oxunmadı'));
      i.src = url;
    });
    const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/webp', 0.82);
    if (!out.startsWith('data:image/webp')) {
      // WebP dəstəklənmirsə (köhnə Safari): krem fonda JPEG
      const j = document.createElement('canvas');
      j.width = c.width;
      j.height = c.height;
      const jc = j.getContext('2d');
      jc.fillStyle = '#f4ecdb';
      jc.fillRect(0, 0, j.width, j.height);
      jc.drawImage(c, 0, 0);
      out = j.toDataURL('image/jpeg', 0.85);
    }
    if (out.length > 1_400_000) throw new Error('Şəkil sıxıldıqdan sonra da böyükdür, başqa şəkil seçin');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pickImage(file) {
  try {
    const data = await processImage(file);
    state.pendingImage = data;
    setPreview(data);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function initDrawer() {
  const upload = $('[data-upload]');
  const input = $('[data-file]');
  upload.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-image]')) return;
    input.click();
  });
  input.addEventListener('change', () => input.files[0] && pickImage(input.files[0]));
  upload.addEventListener('dragover', (e) => {
    e.preventDefault();
    upload.classList.add('is-drag');
  });
  upload.addEventListener('dragleave', () => upload.classList.remove('is-drag'));
  upload.addEventListener('drop', (e) => {
    e.preventDefault();
    upload.classList.remove('is-drag');
    if (e.dataTransfer.files[0]) pickImage(e.dataTransfer.files[0]);
  });
  $('[data-remove-image]').addEventListener('click', (e) => {
    e.stopPropagation();
    state.pendingImage = null;
    input.value = '';
    setPreview(null);
  });
  $$('[data-drawer-close]').forEach((b) => b.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !drawer.hidden && closeDrawer());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-form-error]');
    err.textContent = '';
    const body = {
      id: state.editing?.id,
      name: fld(form, 'name').value,
      tab: fld(form, 'tab').value,
      desc: fld(form, 'desc').value,
      timer: fld(form, 'timer').value,
      regular: fld(form, 'regular').value,
      kcal: fld(form, 'kcal').value,
    };
    if (state.pendingImage !== undefined) body.image = state.pendingImage;
    if (body.name.trim().length < 2) return (err.textContent = 'Məhsulun adını yazın');
    if (!body.timer && !body.regular) return (err.textContent = 'Ən azı bir qiymət yazın');
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try {
      await api('product', { method: 'POST', body });
      closeDrawer();
      toast(state.editing ? 'Məhsul yeniləndi' : 'Yeni məhsul əlavə edildi və saytda göstərilir');
      loadCatalog();
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.code === 'STORE_MISSING') showStoreNotice();
    } finally {
      btn.disabled = false;
    }
  });

  $('[data-delete-product]').addEventListener('click', async () => {
    const p = state.editing;
    if (!p || !(await confirmDialog('Məhsul silinsin?', `"${p.name}" saytdan və paneldən tamamilə silinəcək.`))) return;
    try {
      await api('delete', { method: 'POST', body: { id: p.id } });
      closeDrawer();
      toast('Məhsul silindi');
      loadCatalog();
    } catch (err) {
      handleError(err);
    }
  });
}

/* ==========================================================================
   Parametrlər
   ========================================================================== */
const sform = $('[data-settings-form]');
let savedSettings = null;

function settingsFromForm() {
  return {
    firstHour: fld(sform, 'firstHour').value,
    extraHour: fld(sform, 'extraHour').value,
    open: normalizeTime(fld(sform, 'open').value),
    close: normalizeTime(fld(sform, 'close').value),
    announcementOn: fld(sform, 'announcementOn').checked,
    announcement: fld(sform, 'announcement').value,
  };
}

// "8:00", "800", "0800" yazılışını "08:00" formatına salır (brauzerin dilindən asılı deyil)
function normalizeTime(v) {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(String(v).trim().replace('.', ':'));
  if (!m) return String(v).trim();
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : String(v).trim();
}

function updateSettingsHints() {
  const open = fld(sform, 'open');
  const close = fld(sform, 'close');
  $('[data-hours-preview]').textContent =
    open.value && close.value && open.validity.valid && close.validity.valid
      ? `Saytda belə görünəcək: "Hər gün ${hoursText(open.value, close.value)}"`
      : 'Saatları 24 saat formatında yazın, məsələn 08:00 və 23:00';
  $('[data-announce-count]').textContent = String(fld(sform, 'announcement').value.length);
  const dirty = savedSettings && JSON.stringify(settingsFromForm()) !== JSON.stringify(savedSettings);
  $('[data-settings-state]').textContent = dirty ? 'Yadda saxlanmamış dəyişikliklər var' : 'Bütün dəyişikliklər yadda saxlanılıb';
}

async function loadSettings() {
  try {
    const s = await api('settings');
    fld(sform, 'firstHour').value = s.firstHour;
    fld(sform, 'extraHour').value = s.extraHour;
    fld(sform, 'open').value = s.open;
    fld(sform, 'close').value = s.close;
    fld(sform, 'announcementOn').checked = Boolean(s.announcementOn);
    fld(sform, 'announcement').value = s.announcement || '';
    savedSettings = settingsFromForm();
    updateSettingsHints();
  } catch (err) {
    handleError(err);
  }
}

function initSettings() {
  sform.addEventListener('input', updateSettingsHints);
  ['open', 'close'].forEach((name) =>
    fld(sform, name).addEventListener('change', (e) => {
      e.target.value = normalizeTime(e.target.value);
      updateSettingsHints();
    }),
  );
  sform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', sform);
    btn.disabled = true;
    try {
      await api('settings', { method: 'POST', body: settingsFromForm() });
      savedSettings = settingsFromForm();
      updateSettingsHints();
      toast('Parametrlər yadda saxlanıldı. Sayt 1 dəqiqə ərzində yenilənəcək');
    } catch (err) {
      handleError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ==========================================================================
   Fəaliyyət
   ========================================================================== */
function logIcon(text) {
  const t = fold(text);
  if (t.includes('giris')) return 'a-user';
  if (t.includes('gizled')) return 'a-hide';
  if (t.includes('gosteril')) return 'a-show';
  if (t.includes('parametr')) return 'a-setting';
  if (t.includes('silindi')) return 'a-delete';
  if (t.includes('mehsul')) return 'a-category';
  return 'a-activity';
}

async function loadLog() {
  const list = $('[data-log]');
  try {
    const rows = await api('log');
    list.replaceChildren(
      ...(rows.length
        ? rows.map((r) => el('li', {}, el('span', { class: 'log__icon' }, svgIcon(logIcon(r.text))), el('span', { text: r.text }), el('time', { datetime: r.at, text: dateTime(r.at) })))
        : [emptyNode('Hələ əməliyyat yoxdur', 'Paneldə edilən dəyişikliklər burada görünəcək')]),
    );
  } catch (err) {
    handleError(err);
  }
}

/* ==========================================================================
   Giriş, naviqasiya, başlanğıc
   ========================================================================== */
function showStoreNotice() {
  const n = $('[data-notice]');
  n.className = 'notice notice--warn';
  n.replaceChildren(
    svgIcon('a-setting'),
    el(
      'div',
      {},
      el('b', { text: 'Məlumat bazası qoşulmayıb' }),
      'Statistikanın toplanması və məhsul dəyişikliklərinin saxlanması üçün Vercel layihəsində pulsuz Upstash Redis bazasını qoşun: Storage, Create Database, Upstash for Redis, Connect. Sonra saytı yenidən deploy edin.',
    ),
  );
  n.hidden = false;
}

function setStore(kind) {
  state.store = kind;
  const s = $('[data-store]');
  const map = { redis: ['Canlı baza qoşulub', '#3fb56b'], file: ['Lokal rejim (fayl)', '#d8a93a'], none: ['Baza qoşulmayıb', '#e0564e'] };
  const [text, color] = map[kind] || map.file;
  s.textContent = text;
  s.style.setProperty('--dot', color);
  if (kind === 'none') showStoreNotice();
}

function showLogin(status = {}) {
  $('[data-app]').hidden = true;
  $('[data-login]').hidden = false;
  const note = $('[data-login-note]');
  note.hidden = status.configured !== false;
  note.textContent = 'Admin şifrəsi hələ təyin edilməyib. Vercel layihəsində ADMIN_PASSWORD mühit dəyişənini əlavə edib saytı yenidən deploy edin.';
  setTimeout(() => fld($('[data-login-form]'), 'password').focus(), 50);
}

function showApp() {
  $('[data-login]').hidden = true;
  $('[data-app]').hidden = false;
  route();
}

/* ---------- qiymət pəncərəsi (Clopos məhsulları) ---------- */
function openPrice(p) {
  state.pricing = p;
  const dlg = $('[data-price-modal]');
  const form = $('[data-price-form]', dlg);
  $('[data-price-title]', dlg).textContent = p.name;
  $('[data-price-sub]', dlg).textContent = p.edited ? 'Qiymət paneldə dəyişdirilib' : 'Qiymət Clopos menyusundan gəlir';
  const base = p.clopos || {};
  $('[data-price-hint]', dlg).textContent = `Clopos qiyməti: Timer ${base.timer != null ? money(base.timer) : 'yoxdur'} · adi ${base.regular != null ? money(base.regular) : 'yoxdur'}`;
  fld(form, 'timer').value = p.timer != null ? p.timer : '';
  fld(form, 'regular').value = p.regular != null ? p.regular : '';
  $('[data-price-reset]', dlg).hidden = !p.edited;
  dlg.showModal();
  setTimeout(() => fld(form, 'timer').focus(), 50);
}

function initPriceModal() {
  const dlg = $('[data-price-modal]');
  const form = $('[data-price-form]', dlg);
  const save = async (body) => {
    try {
      await api('price', { method: 'POST', body });
      dlg.close();
      await loadCatalog();
      toast('Qiymət yeniləndi. Sayt 1 dəqiqə ərzində yenilənəcək');
    } catch (err) {
      handleError(err);
    }
  };
  $('[data-price-cancel]', dlg).addEventListener('click', () => dlg.close());
  $('[data-price-reset]', dlg).addEventListener('click', () => state.pricing && save({ id: state.pricing.id, timer: '', regular: '' }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.pricing) save({ id: state.pricing.id, timer: fld(form, 'timer').value, regular: fld(form, 'regular').value });
  });
}

/* ---------- sayt mətnləri ---------- */
const TOKEN_HELP = 'Avtomatik dolan yerlər: {tarif1}, {tarif2}, {saatlar}, {il}';

async function loadTexts() {
  const wrap = $('[data-texts]');
  if (!state.texts) wrap.replaceChildren(el('p', { class: 'hint', text: 'Sayt mətnləri yüklənir…' }));
  try {
    const [html, saved] = await Promise.all([fetch('/', { cache: 'no-store' }).then((r) => r.text()), api('content')]);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fields = [];
    const seen = new Set();
    for (const node of doc.querySelectorAll('[data-cms]')) {
      const key = node.dataset.cms;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push({
        key,
        label: node.dataset.cmsLabel || key,
        kind: node.dataset.cmsKind || 'text',
        def: defaultValue(node),
      });
    }
    state.texts = { fields, saved: saved || {}, draft: { ...(saved || {}) } };
    renderTexts();
  } catch (err) {
    handleError(err);
  }
}

function textsDirty() {
  const t = state.texts;
  if (!t) return false;
  const keys = new Set([...Object.keys(t.saved), ...Object.keys(t.draft)]);
  return [...keys].some((k) => (t.saved[k] || '') !== (t.draft[k] || ''));
}

function updateTextsState() {
  $('[data-texts-state]').textContent = textsDirty() ? 'Yadda saxlanmamış dəyişikliklər var' : 'Bütün mətnlər yadda saxlanılıb';
  const changed = Object.keys(state.texts?.draft || {}).length;
  $('[data-texts-meta]').textContent = changed ? `${changed} sahə dəyişdirilib` : 'Hamısı standart mətndədir';
}

function renderTexts() {
  const t = state.texts;
  if (!t) return;
  $('[data-texts-help]').replaceChildren(
    el('b', { text: 'Necə işləyir: ' }),
    'burada yazdığınız mətn saytda dərhal görünür. Boş buraxsanız, saytın standart mətni qalır. ',
    el('br'),
    el('span', { text: `Format işarələri: ${MARKER_HELP}. ${TOKEN_HELP}` }),
  );
  const q = fold(state.textSearch);
  const wrap = $('[data-texts]');
  const groups = [];
  for (const [prefix, title, sub] of TEXT_GROUPS) {
    const fields = t.fields.filter((f) => f.key.split('.')[0] === prefix && (!q || fold(f.label).includes(q) || fold(f.def).includes(q) || fold(t.draft[f.key] || '').includes(q)));
    if (!fields.length) continue;
    groups.push(el('article', { class: 'tgroup' }, el('h3', { text: title }), el('p', { class: 'tgroup__sub', text: sub }), ...fields.map((f) => textField(f))));
  }
  wrap.replaceChildren(...(groups.length ? groups : [el('p', { class: 'hint', text: 'Axtarışa uyğun mətn tapılmadı' })]));
  updateTextsState();
}

function textField(f) {
  const t = state.texts;
  const value = t.draft[f.key] ?? f.def;
  const changed = (t.draft[f.key] || '') !== '' && t.draft[f.key] !== f.def;
  const multiline = f.def.length > 70 || f.def.includes('\n');
  const input = el(multiline ? 'textarea' : 'input', { 'data-key': f.key, rows: multiline ? '3' : null, type: multiline ? null : 'text', spellcheck: 'false' });
  input.value = value;
  const row = el('div', { class: `tfield${changed ? ' is-changed' : ''}` });
  const reset = el('button', {
    type: 'button',
    class: 'tfield__reset',
    hidden: !changed,
    text: 'Standarta qaytar',
    onclick: () => {
      delete t.draft[f.key];
      input.value = f.def;
      row.classList.remove('is-changed');
      reset.hidden = true;
      flag.hidden = true;
      updateTextsState();
    },
  });
  const flag = el('span', { class: 'tfield__flag', text: 'dəyişdirilib', hidden: !changed });
  input.addEventListener('input', () => {
    const v = input.value;
    if (v.trim() === '' || v === f.def) delete t.draft[f.key];
    else t.draft[f.key] = v;
    const on = Boolean(t.draft[f.key]);
    row.classList.toggle('is-changed', on);
    reset.hidden = !on;
    flag.hidden = !on;
    updateTextsState();
  });
  const hints = {
    rich: 'Format işarələri işləyir',
    tel: 'Telefon: yazdığınız kimi görünür, zəng linki avtomatik qurulur',
    wa: 'WhatsApp nömrəsi: yazdığınız kimi görünür, link avtomatik qurulur',
    url: 'Tam link yazın (https:// ilə)',
    waurl: 'WhatsApp nömrəsi (düymənin linki)',
    count: 'Yalnız rəqəm (məsələn 28.5)',
  };
  row.append(el('div', { class: 'tfield__head' }, el('span', { class: 'tfield__label', text: f.label }), flag, reset), input);
  if (hints[f.kind]) row.append(el('span', { class: 'tfield__hint', text: hints[f.kind] }));
  return row;
}

function initTexts() {
  $('[data-text-search]').addEventListener('input', (e) => {
    state.textSearch = e.target.value;
    renderTexts();
  });
  $('[data-texts-save]').addEventListener('click', async (e) => {
    if (!state.texts) return;
    e.target.disabled = true;
    try {
      await api('content', { method: 'POST', body: { content: state.texts.draft } });
      state.texts.saved = { ...state.texts.draft };
      updateTextsState();
      toast('Mətnlər yadda saxlanıldı. Sayt 1 dəqiqə ərzində yenilənəcək');
    } catch (err) {
      handleError(err);
    } finally {
      e.target.disabled = false;
    }
  });
}

function route() {
  const id = location.hash.slice(1);
  const view = id in VIEWS ? id : 'overview';
  const first = state.view !== view;
  state.view = view;
  $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== view));
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === view;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('[data-title]').textContent = VIEWS[view];
  document.title = `${VIEWS[view]} · Clock & Coffee admin`;
  $('[data-app]').classList.remove('is-menu');
  // başqa bölməyə keçəndə açıq qalmış məhsul pəncərəsi bağlanır
  if (first) closeDrawer();
  if (!first) return;
  if (view === 'overview') loadStats();
  if (view === 'products') loadCatalog();
  if (view === 'texts') loadTexts();
  if (view === 'settings') loadSettings();
  if (view === 'activity') loadLog();
}

function initChrome() {
  const d = new Date();
  $('[data-date]').textContent = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  addEventListener('hashchange', route);
  $('[data-menu-btn]').addEventListener('click', () => $('[data-app]').classList.toggle('is-menu'));
  $('[data-side-close]').addEventListener('click', () => $('[data-app]').classList.remove('is-menu'));
  $('[data-logout]').addEventListener('click', async () => {
    try {
      await api('logout', { method: 'POST' });
    } catch {
      /* keç */
    }
    state.view = null;
    showLogin({ configured: true });
  });

  $('[data-range]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    state.range = Number(b.dataset.r);
    $$('[data-r]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    loadStats();
  });
  $('[data-refresh]').addEventListener('click', loadStats);
  $('[data-table-toggle]').addEventListener('click', (e) => {
    state.table = !state.table;
    e.currentTarget.setAttribute('aria-pressed', String(state.table));
    e.currentTarget.textContent = state.table ? 'Qrafik' : 'Cədvəl';
    if (state.stats) renderMainChart(state.stats);
  });
  let rt;
  new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => state.stats && state.view === 'overview' && !state.table && renderMainChart(state.stats), 120);
  }).observe($('[data-chart]'));

  $('[data-search]').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderProducts();
  });
  $('[data-new-product]').addEventListener('click', () => openDrawer());

  $('[data-login-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = $('[data-login-error]');
    err.textContent = '';
    const btn = $('button[type="submit"]', f);
    btn.disabled = true;
    try {
      await api('login', { method: 'POST', body: { password: fld(f, 'password').value } });
      f.reset();
      showApp();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
}

async function boot() {
  initChrome();
  initDrawer();
  initSettings();
  initTexts();
  initPriceModal();
  let status = { configured: false, authed: false, store: 'file' };
  try {
    status = await (await fetch('/api/admin?action=status', { credentials: 'same-origin' })).json();
  } catch {
    /* şəbəkə xətası */
  }
  setStore(status.store);
  if (status.authed) showApp();
  else showLogin(status);
}

boot();
