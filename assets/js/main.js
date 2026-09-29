/* ==========================================================================
   Clock & Coffee: interaksiyalar və animasiyalar
   GSAP + ScrollTrigger + Lenis (CDN), menyu: /api/menu, ehtiyat: data/menu.json
   ========================================================================== */

import { DEFAULT_SETTINGS, TABS, fold, hoursText } from './site-defaults.js';
import { renderRich } from './site-content.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const hasGsap = Boolean(gsap && ScrollTrigger);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const animate = hasGsap && !reduceMotion;

const TIMER = { firstHour: 6, extraHour: 1 };
const MENU_SOURCES = ['/api/menu', 'data/menu.json'];
const TIMEZONE = 'Asia/Baku';
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];


// Pinned çek hekayəsi: hansı dəqiqədə hansı sətir yazılır (serve: masaya gələn PNG)
const RECEIPT_SCRIPT = [
  { at: 0, hour: 1 },
  { at: 7, item: ['Cappuccino'], serve: 'cappuccino' },
  { at: 36, item: ['Toyuqlu çiabatta sendviç', 'Toyuqlu tost'], serve: 'sandwich' },
  { at: 60, hour: 2 },
  { at: 83, item: ['İced Latte', 'Iced Latte'], serve: 'latte' },
  { at: 120, hour: 3 },
  { at: 141, item: ['Kurasan klassik', 'Kruasan klassik'], serve: 'croissant' },
];
const RECEIPT_END_MIN = 165;

const CALC_PICKS = ['Cappuccino', 'Americano', 'İced Latte', 'Toyuqlu çiabatta sendviç', 'Klassik sezar salatı', 'Kurasan toyuqlu', 'San Sebastian', 'Honey cake'];
const CALC_DEFAULT = { Cappuccino: 1, 'Toyuqlu çiabatta sendviç': 1 };

/* ---------- köməkçilər ---------- */

const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const fmt = (n) => `${money(n)}₼`;
const pad = (n) => String(Math.floor(n)).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ORD = { 1: 'ci', 2: 'ci', 3: 'cü', 4: 'cü', 5: 'ci', 6: 'cı', 7: 'ci', 8: 'ci', 9: 'cu', 10: 'cu' };
const ordinal = (n) => `${n}-${ORD[n] || 'ci'}`;
const clockText = (min) => `${pad(min / 60)}:${pad(min % 60)}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function formatUpdated(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${MONTHS[Number(parts.month) - 1]}, ${parts.hour}:${parts.minute}`;
}

function imgLoaded(img) {
  if (!img || img.complete) return Promise.resolve();
  return new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
  });
}

// data-optional şəkil yüklənməyibsə gizlədilir (fon və SVG əvəzi qalır)
function handleOptionalImages() {
  $$('img[data-optional]').forEach((img) => {
    const mark = () => img.classList.add('is-missing');
    if (img.complete && img.naturalWidth === 0) mark();
    else img.addEventListener('error', mark, { once: true });
  });
  $$('img[data-logo]').forEach((img) => img.addEventListener('error', () => img.classList.add('is-missing'), { once: true }));
}

function splitWords(root) {
  const words = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) frag.append(part);
          else {
            const w = document.createElement('span');
            w.className = 'word';
            w.textContent = part;
            frag.append(w);
            words.push(w);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) walk(child);
    }
  };
  walk(root);
  return words;
}

function buildTicks(group, { cx, cy, count, r1, r2, majorEvery = 5, majorR1, twelve = false }) {
  if (!group) return;
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const major = i % majorEvery === 0;
    const inner = major && majorR1 ? majorR1 : r1;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', (cx + Math.sin(a) * inner).toFixed(2));
    line.setAttribute('y1', (cy - Math.cos(a) * inner).toFixed(2));
    line.setAttribute('x2', (cx + Math.sin(a) * r2).toFixed(2));
    line.setAttribute('y2', (cy - Math.cos(a) * r2).toFixed(2));
    if (major) line.classList.add('is-major');
    if (twelve && i === 0) line.classList.add('is-twelve');
    group.append(line);
  }
}

// Etibarlı "reveal": başlanğıc vəziyyəti qoyur, ekrana girəndə bir dəfə oynadır,
// sonda inline stilləri təmizləyir (pin/refresh zamanı "ilişib qalma" olmur)
const RESET = { x: 0, y: 0, xPercent: 0, yPercent: 0, rotation: 0, rotate: 0, scale: 1, autoAlpha: 1, opacity: 1 };
function reveal(targets, from, { trigger, start = 'top 85%', stagger = 0, duration = 1.1, ease = 'expo.out', delay = 0 } = {}) {
  const els = typeof targets === 'string' ? $$(targets) : [targets].flat().filter(Boolean);
  if (!animate || !els.length) return;
  const to = Object.fromEntries(Object.keys(from).map((k) => [k, RESET[k] ?? 0]));
  const clear = [...new Set(Object.keys(from).map((k) => (k === 'autoAlpha' ? 'opacity,visibility' : k === 'opacity' ? 'opacity' : 'transform')))].join(',');
  gsap.set(els, from);
  ScrollTrigger.create({
    trigger: trigger || els[0],
    start,
    once: true,
    onEnter: () => gsap.to(els, { ...to, duration, stagger, ease, delay, overwrite: 'auto', clearProps: clear }),
  });
}

function bakuTime() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second') + (Date.now() % 1000) / 1000 };
}

/* ---------- admin paneldən gələn ayarlar ---------- */

async function loadSite() {
  try {
    const res = await fetch('/api/site', { cache: 'no-store', signal: AbortSignal.timeout?.(5000) });
    if (res.ok) return await res.json();
  } catch {
    /* statik hostinq: standart ayarlar */
  }
  return null;
}

const tariffText = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

// admin paneldə yazılan nömrə: 050 415 72 07 -> 994504157207
function phoneDigits(value) {
  let d = String(value).replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `994${d.slice(1)}`;
  else if (d.length === 9) d = `994${d}`;
  return d;
}

/** Admin paneldəki "Mətnlər" bölməsindən gələn dəyişikliklər (standart mətnlər HTML-dədir) */
function applyContent(site) {
  const content = site?.content;
  if (!content) return;
  for (const [key, raw] of Object.entries(content)) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    let nodes;
    try {
      nodes = $$(`[data-cms="${CSS.escape(key)}"]`);
    } catch {
      continue;
    }
    for (const el of nodes) {
      const kind = el.dataset.cmsKind || 'text';
      if (kind === 'url') {
        if (/^https?:\/\//i.test(value)) el.setAttribute('href', value);
      } else if (kind === 'waurl') {
        el.setAttribute('href', `https://wa.me/${phoneDigits(value)}`);
      } else if (kind === 'wa') {
        el.textContent = value;
        el.setAttribute('href', `https://wa.me/${phoneDigits(value)}`);
      } else if (kind === 'tel') {
        el.textContent = value;
        el.setAttribute('href', `tel:+${phoneDigits(value)}`);
      } else if (kind === 'count') {
        el.dataset.count = value;
        el.textContent = value;
      } else if (kind === 'rich') {
        el.innerHTML = renderRich(value);
      } else {
        el.textContent = value;
      }
    }
  }
}

/** Paneldə əl ilə dəyişilən qiymətlər Clopos qiymətinin yerinə keçir */
function applyPrices(data, site) {
  const prices = site?.prices;
  if (!data?.sections || !prices) return;
  for (const section of data.sections) {
    for (const item of section.items) {
      const over = prices[String(item.id)];
      if (!over) continue;
      if (over.timer != null) item.timer = over.timer;
      if (over.regular != null) item.regular = over.regular;
    }
  }
}

function applySettings(site) {
  const s = { ...DEFAULT_SETTINGS, ...(site?.settings || {}) };
  TIMER.firstHour = Number(s.firstHour) || DEFAULT_SETTINGS.firstHour;
  TIMER.extraHour = Number(s.extraHour) || DEFAULT_SETTINGS.extraHour;
  $$('[data-tariff="first"]').forEach((n) => (n.textContent = tariffText(TIMER.firstHour)));
  $$('[data-tariff="extra"]').forEach((n) => (n.textContent = tariffText(TIMER.extraHour)));
  $$('[data-open-hours]').forEach((n) => (n.textContent = hoursText(s.open, s.close)));

  const bar = $('[data-announce]');
  if (!bar || !s.announcementOn || !s.announcement) return;
  const key = `cc_ann_${fold(s.announcement).slice(0, 40)}`;
  try {
    if (sessionStorage.getItem(key)) return;
  } catch {
    /* keç */
  }
  $('[data-announce-text]', bar).textContent = s.announcement;
  bar.hidden = false;
  $('[data-announce-close]', bar).addEventListener('click', () => {
    bar.hidden = true;
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* keç */
    }
  });
}

// Anonim statistika: şəxsi məlumat göndərilmir, yalnız təsadüfi brauzer ID-si
let track = () => {};
function initTracking() {
  if (navigator.doNotTrack === '1' || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
  let vid;
  try {
    vid = localStorage.getItem('cc_vid');
    if (!vid) {
      vid = crypto.randomUUID ? crypto.randomUUID() : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('cc_vid', vid);
    }
  } catch {
    vid = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
  track = (type, extra = {}) => {
    const body = JSON.stringify({ type, vid, ...extra });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return;
    } catch {
      /* fetch ilə */
    }
    fetch('/api/track', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  };
  track('view', { ref: document.referrer, w: innerWidth, utm: new URLSearchParams(location.search).get('utm_source') || '' });
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const h = a.getAttribute('href');
      const kind = /wa\.me|whatsapp/i.test(h) ? 'wa' : h.startsWith('tel:') ? 'call' : /google\.[^/]+\/maps|maps\.app/i.test(h) ? 'map' : /instagram\.com/i.test(h) ? 'insta' : /clopos\.menu/i.test(h) ? 'fullmenu' : null;
      if (kind) track('click', { kind });
    },
    true,
  );
  setInterval(() => document.visibilityState === 'visible' && track('ping'), 60000);
}

/* ---------- menyu data ---------- */

async function loadMenu() {
  for (const url of MENU_SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.sections)) return data;
    } catch {
      /* növbəti mənbə */
    }
  }
  return null;
}

function indexMenu(menu) {
  const byName = new Map();
  for (const s of menu.sections) {
    for (const it of s.items) {
      const key = fold(it.name);
      if (!byName.has(key)) byName.set(key, { ...it, section: s.key });
    }
  }
  return {
    find: (...names) => {
      for (const n of names.flat()) {
        const hit = byName.get(fold(n));
        if (hit) return hit;
      }
      return null;
    },
  };
}

// 4:3 kartına uyğun olmayan şəkillər üçün böyük versiyanı (cover) seçirik
function cardImage(img) {
  if (!img) return null;
  const ratio = img.w && img.h ? img.w / img.h : 4 / 3;
  const fits = ratio > 1.25 && ratio < 1.42;
  return fits ? img.card : img.large || img.card;
}

/* ==========================================================================
   Smooth scroll (Lenis)
   ========================================================================== */
let lenis = null;

function initSmoothScroll() {
  // Toxunuşlu ekranlarda doğma scroll: Lenis toxunuşu gözlədən (passive olmayan) dinləyicilər qoşur
  if (!animate || !finePointer || typeof window.Lenis !== 'function') return;
  lenis = new window.Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Scroll kilidi: Lenis varsa onu dayandırır, yoxdursa html-ə sinif qoyur
function lockScroll(on) {
  if (lenis) {
    if (on) lenis.stop();
    else lenis.start();
  } else document.documentElement.classList.toggle('is-locked', on);
}

// Dekorativ sonsuz animasiyalar yalnız element ekranda olanda işləyir
function whileVisible(el, anims, rootMargin = '150px 0px') {
  const list = anims.filter(Boolean);
  if (!el || !list.length || !('IntersectionObserver' in window)) return;
  new IntersectionObserver((entries) => {
    const on = entries[entries.length - 1].isIntersecting;
    list.forEach((a) => a.paused(!on));
  }, { rootMargin }).observe(el);
}

function scrollToTarget(target) {
  if (lenis) lenis.scrollTo(target, { duration: 1.4 });
  else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
}

function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 ? document.querySelector(id) : null;
    if (!target) return;
    e.preventDefault();
    closeMobileNav();
    scrollToTarget(target);
    history.replaceState(null, '', id);
  });
}

/* ==========================================================================
   Preloader
   ========================================================================== */
async function runLoader() {
  const loader = $('.loader');
  if (!loader) return;
  buildTicks($('.loader__ticks'), { cx: 60, cy: 60, count: 12, r1: 44, r2: 50, majorEvery: 3 });
  // Fon tab-ında (document.hidden) animasiya kadrları dayanır, loader-i gözləmirik
  if (!animate || document.hidden) {
    loader.remove();
    return;
  }
  lockScroll(true);
  const count = $('[data-loader-count]');
  const spin = gsap.timeline({ repeat: -1 });
  spin.to('.loader__hand--m', { rotation: 360, svgOrigin: '60 60', duration: 1.1, ease: 'none' }, 0);
  spin.to('.loader__hand--h', { rotation: 30, svgOrigin: '60 60', duration: 1.1, ease: 'none' }, 0);

  const state = { p: 0 };
  const draw = () => (count.textContent = pad(state.p));
  const heroImgs = $$('.hero img');
  const ready = Promise.race([Promise.all([document.fonts?.ready, ...heroImgs.map(imgLoaded)]), wait(3500)]);
  await Promise.all([gsap.to(state, { p: 86, duration: 1.3, ease: 'power2.out', onUpdate: draw }), ready]);
  await gsap.to(state, { p: 100, duration: 0.35, ease: 'power1.in', onUpdate: draw });

  await new Promise((resolve) => {
    gsap
      .timeline({ onComplete: () => { spin.kill(); loader.remove(); } })
      .to('.loader__inner', { y: -30, autoAlpha: 0, duration: 0.45, ease: 'power2.in' })
      .to('.loader__curtain', { yPercent: -100, duration: 1.05, ease: 'expo.inOut' }, '-=0.05')
      .add(resolve, '-=0.75');
  });
  lockScroll(false);
}

/* ==========================================================================
   Hero: saat-fincan + orbit
   ========================================================================== */
function initHero() {
  buildTicks($('[data-ticks]'), { cx: 300, cy: 300, count: 60, r1: 270, r2: 282, majorR1: 258, twelve: true });
  if (!hasGsap) return;

  const hero = $('.hero');
  const hands = { h: $('[data-hand="h"]'), m: $('[data-hand="m"]'), s: $('[data-hand="s"]') };
  // əqrəblər ayrı qatlardır: yalnız transform dəyişir, heç nə yenidən çəkilmir
  const setHour = gsap.quickSetter(hands.h, 'rotation', 'deg');
  const setMin = gsap.quickSetter(hands.m, 'rotation', 'deg');
  const visual = $('[data-hero-visual]');
  const clockcup = $('[data-clockcup]');
  const items = $$('[data-orbit] .orbit__item').map((el) => ({
    el,
    a0: Number(el.dataset.angle) || 0,
    r: Number(el.dataset.r) || 0.6,
    depth: Number(el.dataset.depth) || 1,
    spin: Number(el.dataset.spin) || 0,
    phase: Math.random() * Math.PI * 2,
    alpha: 1,
  }));

  // st: scroll timeline-ın idarə etdiyi dəyərlər
  const st = { minutes: 0, turn: 0, spread: 1, burst: 0, mx: 0, my: 0, tx: 0, ty: 0 };
  let radius = visual.offsetWidth / 2;
  addEventListener('resize', () => (radius = visual.offsetWidth / 2));
  const start = performance.now();
  let lastSec = -1;
  let lastH = NaN;
  let lastM = NaN;

  const frame = () => {
    const t = (performance.now() - start) / 1000;

    // saat əqrəbləri: real Bakı vaxtı + scroll ilə "vaxt keçir" (dəyişməyibsə yazmırıq)
    const now = bakuTime();
    const totalMin = now.h * 60 + now.m + now.s / 60 + st.minutes;
    const h = Math.round((totalMin / 720) * 36000) / 100;
    const m = Math.round((totalMin % 60) * 600) / 100;
    if (h !== lastH) setHour((lastH = h));
    if (m !== lastM) setMin((lastM = m));
    const sec = Math.floor(now.s);
    if (sec !== lastSec) {
      lastSec = sec;
      const rot = sec * 6 + ((st.minutes * 360) % 360);
      if (animate) gsap.to(hands.s, { rotation: `${rot}_short`, duration: 0.5, ease: 'elastic.out(1.2, 0.5)', overwrite: true });
      else gsap.set(hands.s, { rotation: rot });
    }

    // orbit: məhsullar saat rəqəmləri kimi fincanın ətrafında fırlanır
    st.mx += (st.tx - st.mx) * 0.06;
    st.my += (st.ty - st.my) * 0.06;
    for (const it of items) {
      if (it.el.classList.contains('is-missing')) continue;
      const idle = animate ? t * 2.4 : 0;
      const ang = ((it.a0 + idle + st.turn * (0.55 + it.depth * 0.45)) * Math.PI) / 180;
      const r = radius * it.r * (st.spread + st.burst * (it.depth - 0.6));
      const bob = animate ? Math.sin(t * 1.2 + it.phase) * 9 : 0;
      const x = Math.sin(ang) * r + st.mx * it.depth * 24;
      const y = -Math.cos(ang) * r + bob + st.my * it.depth * 18;
      const rot = it.spin * (st.turn / 100) + Math.sin(t * 0.9 + it.phase) * 5;
      const scale = 1 + st.burst * (it.depth - 1) * 0.8;
      // hər kadr yeni tween yaratmırıq: transform birbaşa yazılır (GPU qatı, yenidən çəkilmə yoxdur)
      it.el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)${scale === 1 ? '' : ` scale(${scale.toFixed(4)})`}`;
      const alpha = Math.min(1, Math.max(0, 1 - Math.max(0, st.burst - 0.9) * 1.2));
      if (alpha !== it.alpha) {
        it.alpha = alpha;
        it.el.style.opacity = String(alpha);
        it.el.style.visibility = alpha > 0 ? '' : 'hidden';
      }
    }
  };

  // Kadr dövrəsi yalnız hero ekrana yaxın olanda işləyir (aşağıda telefon boşuna yüklənmir)
  let running = null;
  const run = (on) => {
    if (on === running) return;
    running = on;
    if (on) gsap.ticker.add(frame);
    else gsap.ticker.remove(frame);
    hero.classList.toggle('is-offscreen', !on);
  };
  frame();
  if ('IntersectionObserver' in window) new IntersectionObserver((entries) => run(entries[entries.length - 1].isIntersecting), { rootMargin: '300px 0px' }).observe(hero);
  else run(true);

  if (!animate) return;

  if (finePointer) {
    const cupX = gsap.quickTo(clockcup, 'x', { duration: 1.2, ease: 'power3.out' });
    const cupY = gsap.quickTo(clockcup, 'y', { duration: 1.2, ease: 'power3.out' });
    $('.hero').addEventListener('pointermove', (e) => {
      st.tx = e.clientX / innerWidth - 0.5;
      st.ty = e.clientY / innerHeight - 0.5;
      cupX(st.tx * 14);
      cupY(st.ty * 10);
    });
  }

  // Scroll ssenarisi: vaxt uçur, məhsullar dairə boyu fırlanır, sonda ətrafa səpələnir
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=130%', pin: true, scrub: 0.8, anticipatePin: 1 } });
    tl.to(st, { turn: 160, minutes: 240, duration: 1, ease: 'none' }, 0)
      .to(st, { spread: 1.16, duration: 0.55, ease: 'sine.inOut' }, 0)
      .to(st, { burst: 1.7, duration: 0.42, ease: 'power2.in' }, 0.58)
      .to(clockcup, { scale: 1.16, rotation: 50, duration: 0.7, ease: 'none' }, 0)
      .to(clockcup, { scale: 0.62, yPercent: 26, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0.7)
      .to('[data-hero-copy]', { yPercent: -22, autoAlpha: 0, duration: 0.42, ease: 'power1.in' }, 0.12)
      .to('[data-hero-bigword]', { xPercent: -16, duration: 1, ease: 'none' }, 0)
      .to('.hero__scroll', { autoAlpha: 0, duration: 0.08 }, 0);
  });
  mm.add('(max-width: 900px)', () => {
    gsap
      .timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .to(st, { turn: 130, minutes: 180, spread: 1.12, duration: 1, ease: 'none' }, 0)
      .to(clockcup, { rotation: 30, scale: 0.92, duration: 1, ease: 'none' }, 0);
  });
}

function heroIntro() {
  if (!animate) return;
  gsap
    .timeline({ defaults: { ease: 'expo.out' } })
    .from('.nav', { yPercent: -120, duration: 1.1, clearProps: 'transform' }, 0)
    .from('.hero__title .line__in', { yPercent: 115, rotate: 3, duration: 1.3, stagger: 0.1 }, 0.05)
    .from('.hero__eyebrow', { y: 20, autoAlpha: 0, duration: 0.9 }, 0.2)
    .from(['.hero__lead', '.hero__actions', '.hero__chips li'], { y: 30, autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.35)
    .from(['.clockcup__ring', '.clockcup__cup', '.clockcup__hands'], { scale: 0.55, rotation: -70, autoAlpha: 0, transformOrigin: '50% 50%', duration: 1.8, stagger: 0.06 }, 0.05)
    .from('[data-orbit]', { scale: 0.25, rotation: -140, autoAlpha: 0, transformOrigin: '50% 50%', duration: 2.1 }, 0.2)
    .from('.hero__bigword', { yPercent: 40, autoAlpha: 0, duration: 1.8 }, 0.1)
    .from('.hero__scroll', { autoAlpha: 0, y: 10, duration: 0.8 }, 0.9);
}

/* ==========================================================================
   Parallax, sürüşən PNG-lər, marquee, sözlər
   ========================================================================== */
function initParallax() {
  if (!animate) return;
  $$('[data-speed]').forEach((el) => {
    const speed = Number(el.dataset.speed) || 0;
    const trigger = el.closest('section') || el;
    gsap.fromTo(
      el,
      { y: () => -speed * innerHeight * 0.25 },
      { y: () => speed * innerHeight * 0.25, ease: 'none', scrollTrigger: { trigger, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } },
    );
  });
}

// Bölmələrin kənarında scroll etdikcə üzən / fırlanan PNG-lər
function initDrift() {
  if (!animate) return;
  $$('[data-drift]').forEach((el) => {
    const y = Number(el.dataset.y) || -200;
    const r = Number(el.dataset.r) || 0;
    const x = Number(el.dataset.x) || 0;
    gsap.fromTo(
      el,
      { y: -y / 2, x: -x / 2, rotation: -r / 2 },
      { y: y / 2, x: x / 2, rotation: r / 2, ease: 'none', scrollTrigger: { trigger: el.closest('section'), start: 'top bottom', end: 'bottom top', scrub: 0.4 } },
    );
  });
}

function initMarquee() {
  const track = $('[data-marquee]');
  if (!track) return;
  const group = track.firstElementChild;
  const copies = Math.max(2, Math.ceil((innerWidth * 2) / Math.max(group.offsetWidth, 1)) + 1);
  for (let i = 1; i < copies; i++) track.append(group.cloneNode(true));
  if (!animate) return;

  const width = group.offsetWidth;
  const loop = gsap.to(track, { x: -width, duration: width / 90, ease: 'none', repeat: -1 });
  loop.totalTime(loop.duration() * 500);
  let dir = 1;
  const skew = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3.out' });
  const bar = track.closest('.marquee') || track;
  whileVisible(bar, [loop]);
  // sürət effekti yalnız marquee ekranda olanda hesablanır
  ScrollTrigger.create({
    trigger: bar,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const v = self.getVelocity();
      dir = self.direction;
      gsap.to(loop, { timeScale: dir * (1 + Math.min(Math.abs(v) / 400, 5)), duration: 0.2, overwrite: true });
      gsap.to(loop, { timeScale: dir, duration: 1.2, delay: 0.2, ease: 'power2.out' });
      skew(gsap.utils.clamp(-10, 10, v / -250));
    },
  });
}

function initWords() {
  const el = $('[data-words]');
  if (!el) return;
  const words = splitWords(el);
  if (!animate) return;
  gsap.fromTo(words, { opacity: 0.12 }, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 45%', scrub: true } });
  const stamp = $('[data-stamp]');
  if (stamp) gsap.from(stamp, { scale: 2.4, autoAlpha: 0, rotation: -30, duration: 0.6, ease: 'back.out(2.2)', scrollTrigger: { trigger: stamp, start: 'top 85%' } });
}

/* ==========================================================================
   Sezar hekayəsi
   ========================================================================== */
function initCaesar(menu) {
  const section = $('[data-caesar]');
  if (!section) return;
  const item = menu?.find('Klassik sezar salatı', 'Klassik Sezar salatı');
  const img = $('[data-caesar-img]');
  const regEl = $('[data-caesar-regular]');
  const timEl = $('[data-caesar-timer]');
  const bowl = $('[data-caesar-bowl]');
  const sticker = $('[data-caesar-sticker]');
  if (item) {
    const bowlMissing = !bowl || bowl.classList.contains('is-missing') || (bowl.complete && bowl.naturalWidth === 0);
    if (item.img && bowlMissing) img.src = item.img.large || item.img.card;
    bowl?.addEventListener('error', () => item.img && (img.src = item.img.large || item.img.card), { once: true });
    if (item.regular != null) {
      regEl.textContent = money(item.regular);
      $('[data-sticker-regular]').textContent = Number.isInteger(item.regular) ? item.regular : money(item.regular);
    }
    if (item.timer != null) {
      timEl.textContent = money(item.timer);
      $('[data-sticker-timer]').textContent = money(item.timer);
    }
  }
  if (!animate) return;
  // Kasa scroll etdikcə fırlanır, stiker "yapışır"
  if (bowl) gsap.fromTo(bowl, { rotation: -40, scale: 0.92 }, { rotation: 40, scale: 1.04, ease: 'none', scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
  let bob = null;
  if (sticker) {
    gsap.from(sticker, { scale: 0, rotation: -90, duration: 0.9, ease: 'back.out(2.4)', scrollTrigger: { trigger: '.caesar__photo', start: 'top 60%' } });
    bob = gsap.to(sticker, { y: -10, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }
  const strike = regEl.closest('.strike');
  const target = item?.timer ?? parseFloat(timEl.textContent);
  const counter = { v: 0 };
  gsap
    .timeline({ scrollTrigger: { trigger: '.compare', start: 'top 80%' } })
    .fromTo(strike, { '--strike': 0 }, { '--strike': 1, duration: 0.6, ease: 'power3.inOut' })
    .to(counter, { v: target, duration: 1.2, ease: 'power3.out', onUpdate: () => (timEl.textContent = money(counter.v)) }, '-=0.2');
  gsap.from('.caesar__badge', { rotation: -120, scale: 0.4, autoAlpha: 0, duration: 1.2, ease: 'back.out(1.6)', scrollTrigger: { trigger: '.caesar__photo', start: 'top 75%' } });
  const badgeSpin = gsap.to('.caesar__badge', { rotation: 360, duration: 30, ease: 'none', repeat: -1 });
  whileVisible(section, [bob, badgeSpin]);
  gsap.from('.caesar__img', { clipPath: 'circle(0% at 50% 50%)', duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.caesar__photo', start: 'top 80%' } });
}

/* ==========================================================================
   Timer hekayəsi: pinned çek + masaya gələn sifarişlər
   ========================================================================== */
function initTimerStory(menu) {
  const list = $('[data-receipt-lines]');
  if (!list) return;
  buildTicks($('[data-sw-ticks]'), { cx: 200, cy: 200, count: 60, r1: 150, r2: 158, majorR1: 142 });

  const lines = [];
  for (const step of RECEIPT_SCRIPT) {
    if (step.hour) {
      const price = step.hour === 1 ? TIMER.firstHour : TIMER.extraHour;
      lines.push({
        at: step.at,
        timer: price,
        regular: 0,
        time: true,
        html: `<span class="t">${clockText(step.at)}</span><span class="n">${ordinal(step.hour)} saat<small>${step.hour === 1 ? 'Timer başladı' : 'növbəti saat'}</small></span><span class="p">${fmt(price)}</span>`,
      });
    } else {
      const it = menu?.find(step.item);
      if (!it || it.timer == null) continue;
      const was = it.regular != null ? `<s>${money(it.regular)}</s>` : '';
      lines.push({
        at: step.at,
        timer: it.timer,
        regular: it.regular ?? it.timer,
        serve: step.serve ? $(`[data-serve="${step.serve}"]`) : null,
        html: `<span class="t">${clockText(step.at)}</span><span class="n">${esc(it.name)}</span><span class="p">${was}${fmt(it.timer)}</span>`,
      });
    }
  }
  list.innerHTML = lines.map((l) => `<li class="${l.time ? 'is-time' : ''}">${l.html}</li>`).join('');
  const lis = $$('li', list);

  const timeEl = $('[data-timer-time]');
  const feeEl = $('[data-timer-fee]');
  const totalEl = $('[data-total-timer]');
  const regEl = $('[data-total-regular]');
  const saveEl = $('[data-total-save]');
  const ring = $('[data-sw-progress]');
  const hand = $('[data-sw-hand]');
  const stamp = $('[data-receipt-stamp]');
  const alarm = $('.stopwatch__alarm');
  const C = 2 * Math.PI * 176;
  let lastHour = 0;
  let stampOn = false;
  let lastMinutes = NaN;
  // mətn eyni qalıbsa DOM-a toxunmuruq (hər kadr layout olmasın)
  const put = (el, v) => {
    if (el.textContent !== v) el.textContent = v;
  };

  const render = (minutes) => {
    if (minutes === lastMinutes) return;
    lastMinutes = minutes;
    const m = Math.min(minutes, RECEIPT_END_MIN);
    put(timeEl, clockText(m));
    const hour = Math.floor(m / 60) + 1;
    put(feeEl, String(TIMER.firstHour + (hour - 1) * TIMER.extraHour));
    let t = 0;
    let r = 0;
    lines.forEach((l, i) => {
      const on = m >= l.at && (l.at > 0 || minutes > 0.5);
      lis[i].classList.toggle('is-on', on);
      l.serve?.classList.toggle('is-served', on);
      if (on) {
        t += l.timer;
        r += l.regular;
      }
    });
    put(totalEl, fmt(t));
    put(regEl, fmt(r));
    put(saveEl, fmt(Math.max(0, r - t)));
    ring.style.strokeDashoffset = String(C * (1 - (m % 60) / 60));
    if (hasGsap) gsap.set(hand, { rotation: m * 6, svgOrigin: '200 200' });

    if (hour !== lastHour && minutes > 0.5) {
      lastHour = hour;
      if (animate) {
        gsap.fromTo(feeEl, { scale: 1.6, color: '#ffffff' }, { scale: 1, color: '', duration: 0.6, ease: 'back.out(3)' });
        if (alarm) gsap.fromTo(alarm, { rotation: -14 }, { rotation: 0, duration: 1, ease: 'elastic.out(1.6, 0.18)' });
      }
    }
    const done = minutes >= RECEIPT_END_MIN - 2;
    if (done !== stampOn && stamp) {
      stampOn = done;
      if (animate) gsap.to(stamp, done ? { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.5)' } : { opacity: 0, scale: 1.8, duration: 0.3 });
      else stamp.style.opacity = done ? '1' : '0';
    }
  };
  ring.style.strokeDasharray = String(C);
  render(0);

  if (!animate) {
    render(RECEIPT_END_MIN);
    return;
  }

  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    ScrollTrigger.create({
      trigger: '[data-timer-pin]',
      start: 'top top',
      end: '+=220%',
      pin: true,
      scrub: 0.6,
      onUpdate: (self) => render(self.progress * RECEIPT_END_MIN),
    });
  });
  mm.add('(max-width: 900px)', () => {
    ScrollTrigger.create({
      trigger: '[data-receipt]',
      start: 'top 85%',
      end: 'bottom 45%',
      scrub: 0.6,
      onUpdate: (self) => render(self.progress * RECEIPT_END_MIN),
    });
  });

  reveal('.receipt', { y: 120, rotation: 8, autoAlpha: 0 }, { trigger: '.timer', start: 'top 60%', duration: 1.2 });
  reveal('.stopwatch__svg, .stopwatch__readout', { scale: 0.7, autoAlpha: 0 }, { trigger: '.timer', start: 'top 60%', duration: 1.2 });
  reveal('.step', { y: 60, autoAlpha: 0 }, { trigger: '.steps', stagger: 0.12, duration: 1 });
}

/* ==========================================================================
   Kalkulyator
   ========================================================================== */
function initCalculator(menu) {
  const wrap = $('[data-calc-items]');
  const range = $('[data-hours]');
  if (!wrap || !range) return;
  const hoursOut = $('[data-hours-out]');
  const timerOut = $('[data-calc-timer]');
  const timerNote = $('[data-calc-timer-note]');
  const regularOut = $('[data-calc-regular]');
  const verdict = $('[data-calc-verdict]');

  const items = CALC_PICKS.map((n) => menu?.find(n)).filter((it) => it && it.timer != null && it.regular != null);
  if (!items.length) {
    wrap.innerHTML = '<p class="calc__loading">Menyu yüklənmədi. Qiymətləri elektron menyuda görə bilərsiniz.</p>';
    return;
  }
  const qty = new Map(items.map((it) => [it.id, CALC_DEFAULT[it.name] || 0]));

  wrap.innerHTML = items
    .map(
      (it) => `
      <div class="chip" data-id="${it.id}">
        ${it.img ? `<img src="${esc(it.img.card)}" alt="" loading="lazy" decoding="async">` : '<span></span>'}
        <div class="chip__name">${esc(it.name)}<small>${fmt(it.timer)} <s>${fmt(it.regular)}</s></small></div>
        <div class="chip__qty">
          <button type="button" data-step="-1" aria-label="${esc(it.name)}: azalt"><svg class="icon"><use href="#i-minus"/></svg></button>
          <output aria-live="polite">0</output>
          <button type="button" data-step="1" aria-label="${esc(it.name)}: artır"><svg class="icon"><use href="#i-plus"/></svg></button>
        </div>
      </div>`,
    )
    .join('');
  $$('img', wrap).forEach((img) => img.addEventListener('error', () => (img.style.visibility = 'hidden'), { once: true }));

  const shown = { t: 0, r: 0 };
  const update = () => {
    const hours = Number(range.value);
    range.style.setProperty('--p', `${((hours - 1) / (Number(range.max) - 1)) * 100}%`);
    hoursOut.textContent = `${hours} saat`;
    const fee = TIMER.firstHour + (hours - 1) * TIMER.extraHour;
    let food = 0;
    let regular = 0;
    for (const it of items) {
      const n = qty.get(it.id);
      food += n * it.timer;
      regular += n * it.regular;
      const chip = wrap.querySelector(`[data-id="${it.id}"]`);
      chip.classList.toggle('is-active', n > 0);
      chip.querySelector('output').textContent = n;
      chip.querySelector('[data-step="-1"]').disabled = n === 0;
    }
    const total = fee + food;
    timerNote.textContent = `${hours} saat: ${fmt(fee)} + menyu ${fmt(food)}`;
    const diff = regular - total;
    verdict.classList.toggle('is-neutral', !(regular > 0 && diff > 0.004));
    if (regular === 0) verdict.textContent = 'Menyudan bir neçə məhsul seç, fərqi dərhal görəcəksən.';
    else if (diff > 0.004) verdict.textContent = `Timer ilə ${fmt(diff)} qənaət edirsən.`;
    else if (diff < -0.004) verdict.textContent = `Bu qədər sifarişdə adi menyu ${fmt(-diff)} sərfəlidir. Seçim səndədir!`;
    else verdict.textContent = 'Hər iki variant eyni məbləğdir.';

    if (animate) {
      gsap.to(shown, {
        t: total,
        r: regular,
        duration: 0.6,
        ease: 'power3.out',
        overwrite: true,
        onUpdate: () => {
          timerOut.textContent = fmt(shown.t);
          regularOut.textContent = fmt(shown.r);
        },
      });
    } else {
      timerOut.textContent = fmt(total);
      regularOut.textContent = fmt(regular);
    }
  };

  let used = false;
  const markUsed = () => {
    if (!used) track('calc');
    used = true;
  };
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    markUsed();
    const id = Number(btn.closest('.chip').dataset.id);
    qty.set(id, Math.max(0, Math.min(9, qty.get(id) + Number(btn.dataset.step))));
    update();
  });
  range.addEventListener('input', () => {
    markUsed();
    update();
  });
  update();

  reveal('.chip', { y: 30, autoAlpha: 0 }, { trigger: wrap, stagger: 0.05, duration: 0.8 });
}

/* ==========================================================================
   Menyu
   ========================================================================== */
function initMenu(data, site) {
  const tabsEl = $('[data-menu-tabs]');
  const grid = $('[data-menu-grid]');
  const section = $('.menu');
  if (!tabsEl || !grid) return;

  if (!data) {
    grid.innerHTML = '<p class="menu__loading">Menyu hazırda yüklənmədi. Tam menyunu <a href="https://clockcoffee.clopos.menu/az/1/products" target="_blank" rel="noopener" style="text-decoration:underline">elektron menyuda</a> görə bilərsiniz.</p>';
    return;
  }

  const custom = site?.custom || [];
  const tabs = TABS.map((t) => {
    const pool = data.sections.filter((s) => t.sections.includes(s.key)).flatMap((s) => s.items);
    const own = custom.filter((c) => c.tab === t.id);
    const chosen = site?.tabs?.[t.id];
    let items;
    if (Array.isArray(chosen)) {
      // admin paneldə seçilmiş sıra
      const byId = new Map([...pool.map((i) => [String(i.id), i]), ...own.map((c) => [String(c.id), c])]);
      items = chosen.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      items = t.pick.length ? t.pick.map((n) => pool.find((i) => fold(i.name) === fold(n))).filter(Boolean) : pool.slice();
      if (items.length < 4) {
        for (const i of pool) {
          if (items.length >= 6) break;
          if (!items.includes(i) && i.img) items.push(i);
        }
      }
      items.push(...own);
    }
    const note = data.sections.find((s) => t.sections.includes(s.key) && s.note)?.note || null;
    return { ...t, items, note };
  }).filter((t) => t.items.length);

  let mode = 'timer';
  let active = tabs[0]?.id;

  tabsEl.innerHTML = tabs
    .map((t, i) => `<button class="tab" role="tab" type="button" id="tab-${t.id}" aria-controls="menu-panel" aria-selected="${i === 0}" data-tab="${t.id}">${esc(t.title)}${t.note ? `<small>${esc(t.note)}</small>` : ''}</button>`)
    .join('');
  grid.id = 'menu-panel';
  grid.setAttribute('role', 'tabpanel');

  const priceHtml = (it) => {
    const main = mode === 'timer' ? it.timer ?? it.regular : it.regular ?? it.timer;
    let side = '';
    if (mode === 'timer' && it.timer != null && it.regular != null) side = `<span class="dish__was"><s>${fmt(it.regular)}</s><em>adi qiymət</em></span>`;
    else if (mode === 'regular' && it.timer != null && it.regular != null) side = `<span class="dish__was dish__was--timer"><b>${fmt(it.timer)}</b><em>Timer ilə</em></span>`;
    else if (mode === 'timer' && it.timer == null) side = '<span class="dish__was"><em>yalnız adi menyuda</em></span>';
    return `<span class="tag">${money(main)}<small>₼</small></span>${side}`;
  };

  const card = (it) => {
    const src = cardImage(it.img);
    return `
    <article class="dish" data-cursor="Dadına bax">
      <div class="dish__media${src ? '' : ' dish__media--empty'}">
        ${src ? `<img src="${esc(src)}" data-fallback="${esc(it.img.card || '')}" alt="${esc(it.name)}" loading="lazy" decoding="async">` : '<svg class="icon"><use href="#i-clock"/></svg>'}
        ${it.kcal ? `<span class="dish__kcal">${it.kcal} kkal</span>` : ''}
      </div>
      <div class="dish__body">
        <h3 class="dish__name">${esc(it.name)}</h3>
        ${it.desc ? `<p class="dish__desc">${esc(it.desc)}</p>` : ''}
        <div class="dish__price" data-price-id="${it.id}">${priceHtml(it)}</div>
      </div>
    </article>`;
  };

  const wireImages = () => {
    $$('.dish__media img', grid).forEach((img) =>
      img.addEventListener('error', () => {
        const fb = img.dataset.fallback;
        if (fb && !img.src.endsWith(fb)) img.src = fb;
        else img.closest('.dish__media').classList.add('dish__media--empty');
      }),
    );
  };

  const renderGrid = (first = false) => {
    const tab = tabs.find((t) => t.id === active);
    grid.setAttribute('aria-labelledby', `tab-${tab.id}`);
    const build = () => {
      grid.innerHTML = tab.items.map(card).join('');
      wireImages();
      initTilt(grid);
      if (animate) gsap.fromTo('.dish', { y: 50, autoAlpha: 0, rotateX: -12 }, { y: 0, autoAlpha: 1, rotateX: 0, duration: 0.9, stagger: 0.06, ease: 'expo.out', clearProps: 'transform' });
      if (hasGsap) ScrollTrigger.refresh();
    };
    if (animate && !first) gsap.to('.dish', { y: -20, autoAlpha: 0, duration: 0.25, stagger: 0.02, ease: 'power2.in', onComplete: build });
    else build();
  };

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || btn.dataset.tab === active) return;
    active = btn.dataset.tab;
    track('tab', { tab: active });
    $$('[data-tab]', tabsEl).forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    renderGrid();
  });
  tabsEl.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const btns = $$('[data-tab]', tabsEl);
    const i = btns.findIndex((b) => b.dataset.tab === active);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    next.focus();
    next.click();
  });

  const toggle = $('[data-price-toggle]');
  toggle?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    $$('[data-mode]', toggle).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    toggle.classList.toggle('is-regular', mode === 'regular');
    section.classList.toggle('is-regular', mode === 'regular');
    const tab = tabs.find((t) => t.id === active);
    $$('[data-price-id]', grid).forEach((el) => {
      const it = tab.items.find((i) => String(i.id) === el.dataset.priceId);
      if (!it) return;
      if (animate) {
        gsap.to(el, {
          rotateX: 90,
          autoAlpha: 0,
          duration: 0.18,
          ease: 'power2.in',
          onComplete: () => {
            el.innerHTML = priceHtml(it);
            gsap.fromTo(el, { rotateX: -90 }, { rotateX: 0, autoAlpha: 1, duration: 0.4, ease: 'back.out(2)' });
          },
        });
      } else el.innerHTML = priceHtml(it);
    });
  });

  const updated = $('[data-menu-updated]');
  const when = data.fetchedAt ? formatUpdated(data.fetchedAt) : '';
  if (updated && when) updated.textContent = `Qiymətlər elektron menyudan avtomatik yenilənir · son yenilənmə: ${when}`;

  renderGrid(true);
}

function initTilt(root) {
  if (!animate || !finePointer) return;
  $$('.dish', root).forEach((card) => {
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    gsap.set(card, { transformPerspective: 900 });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 10);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
    });
    card.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  });
}

/* ==========================================================================
   Məkan (stacking kartlar), filiallar, CTA
   ========================================================================== */
function initStack() {
  const cards = $$('.stack__card');
  if (!animate || !cards.length) return;
  cards.forEach((card, i) => {
    const photo = $('.stack__media img:not(.stack__art)', card);
    if (photo) gsap.fromTo(photo, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true } });
    const next = cards[i + 1];
    const shade = $('.stack__shade', card);
    if (next) {
      // kölgə ayrıca qatdadır: yalnız opacity dəyişir, kart yenidən çəkilmir
      const tl = gsap.timeline({ scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 20%', scrub: true } });
      tl.to(card, { scale: 0.92, ease: 'none' }, 0);
      if (shade) tl.to(shade, { opacity: 0.45, ease: 'none' }, 0);
    }
  });

  // Coffee kartındakı PNG kompozisiya scroll ilə canlanır
  const coffee = $('.stack__card--coffee');
  if (coffee) {
    const scrub = { trigger: coffee, start: 'top bottom', end: 'bottom top', scrub: 0.5 };
    gsap.fromTo('.stack__art--cup', { rotation: -40, scale: 0.9 }, { rotation: 80, scale: 1.05, ease: 'none', scrollTrigger: scrub });
    gsap.fromTo('.stack__art--latte', { yPercent: 40, rotation: 8 }, { yPercent: -30, rotation: -6, ease: 'none', scrollTrigger: scrub });
    gsap.fromTo('.stack__art--beans', { yPercent: 60, rotation: -60 }, { yPercent: -60, rotation: 120, ease: 'none', scrollTrigger: scrub });
    gsap.fromTo('.stack__art--branch', { rotation: -18, yPercent: -20 }, { rotation: 14, yPercent: 20, ease: 'none', scrollTrigger: scrub });
  }
  reveal('.stack__card--coffee .stack__content > *', { y: 40, autoAlpha: 0 }, { trigger: '.stack', start: 'top 70%', stagger: 0.08, duration: 1 });
}

function initBranches() {
  if (!animate) return;
  const mask = $('[data-route-mask]');
  if (mask) {
    const len = mask.getTotalLength();
    gsap.set(mask, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(mask, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.branches__map', start: 'top 80%', end: 'bottom 40%', scrub: true } });
  }
  gsap.from('[data-pin] .map__pin-in', { scale: 0, transformOrigin: '50% 50%', duration: 0.8, stagger: 0.4, ease: 'back.out(3)', scrollTrigger: { trigger: '.branches__map', start: 'top 75%' } });
  reveal('.branch', { y: 80, autoAlpha: 0 }, { trigger: '.branches__grid', stagger: 0.15 });
  reveal('.branches__title', { yPercent: 40, autoAlpha: 0 }, { duration: 1.2 });
}

function initCta() {
  if (!animate) return;
  const alarm = $('[data-cta-alarm]');
  const bell = alarm && $('img', alarm);
  if (alarm && bell && !bell.classList.contains('is-missing')) {
    // Zəng çalır: saat titrəyir, səs dalğaları yayılır
    const ring = () => {
      gsap
        .timeline()
        .to(bell, { rotation: 9, duration: 0.05, ease: 'none' })
        .to(bell, { rotation: -9, duration: 0.1, ease: 'none', repeat: 11, yoyo: true })
        .to(bell, { rotation: 0, duration: 0.8, ease: 'elastic.out(1.4, 0.25)' });
      gsap.fromTo(
        '.cta__wave path',
        { autoAlpha: 0, scale: 0.7, transformOrigin: '50% 50%' },
        { autoAlpha: 1, scale: 1, duration: 0.35, stagger: { each: 0.08, repeat: 3, yoyo: true }, ease: 'power2.out', onComplete: () => gsap.to('.cta__wave path', { autoAlpha: 0, duration: 0.3 }) },
      );
    };
    ScrollTrigger.create({ trigger: '.cta', start: 'top 55%', onEnter: ring, onEnterBack: ring });
    alarm.addEventListener('pointerenter', ring);
    gsap.fromTo(alarm, { y: 30, rotation: -8 }, { y: -40, rotation: 6, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: 0.5 } });
  }
  reveal('.cta__title .line__in', { yPercent: 110 }, { trigger: '.cta__title', stagger: 0.12, duration: 1.3 });
  reveal('.cta__actions .btn', { y: 30, autoAlpha: 0 }, { trigger: '.cta__actions', start: 'top 92%', stagger: 0.1, duration: 1 });
  gsap.fromTo('.footer__giant', { yPercent: 60 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });

  $$('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const c = { v: 0 };
    gsap.to(c, { v: to, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' }, onUpdate: () => (el.textContent = c.v.toFixed(1)) });
  });
}

function initReveals() {
  if (!animate) return;
  $$('.menu__head, .calc__intro, .space__head, .caesar__copy > *, .manifesto .eyebrow').forEach((el) => reveal(el, { y: 50, autoAlpha: 0 }, { start: 'top 88%' }));
  reveal('.space__quote', { autoAlpha: 0, scale: 0.9 }, { start: 'top 90%', duration: 1.2 });
}

/* ==========================================================================
   Naviqasiya, kursor, maqnit düymələr, proqres saatı
   ========================================================================== */
function closeMobileNav() {
  const panel = $('[data-mnav]');
  const burger = $('.nav__burger');
  if (!panel?.classList.contains('is-open')) return;
  panel.classList.remove('is-open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Menyunu aç');
  lockScroll(false);
}

function initNav() {
  const nav = $('[data-nav]');
  const burger = $('.nav__burger');
  const panel = $('[data-mnav]');
  burger?.addEventListener('click', () => {
    const open = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menyunu bağla' : 'Menyunu aç');
    nav.classList.remove('is-hidden');
    document.documentElement.classList.remove('nav-hidden');
    nav.classList.toggle('is-open', open);
    lockScroll(open);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMobileNav());

  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 30);
    if (!panel?.classList.contains('is-open')) {
      const hide = y > lastY && y > 500;
      nav.classList.toggle('is-hidden', hide);
      // elan zolağı naviqasiya ilə birlikdə gizlənir
      document.documentElement.classList.toggle('nav-hidden', hide);
    }
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Bütün pin-lər yarandıqdan SONRA çağırılır ki, mövqelər düz hesablansın
function initNavThemes() {
  if (!hasGsap) return;
  const nav = $('[data-nav]');
  const navMid = () => (nav.offsetHeight || 76) / 2;
  $$('[data-theme]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: () => `top top+=${navMid()}`,
      end: () => `bottom top+=${navMid()}`,
      onToggle: (self) => self.isActive && nav.classList.toggle('is-light', sec.dataset.theme === 'light'),
    });
  });
  const links = $$('.nav__links a');
  links.forEach((a) => {
    const sec = $(a.getAttribute('href'));
    if (!sec) return;
    ScrollTrigger.create({
      trigger: sec,
      start: 'top center',
      end: 'bottom center',
      onToggle: (self) => {
        if (self.isActive) links.forEach((l) => l.classList.toggle('is-active', l === a));
        else a.classList.remove('is-active');
      },
    });
  });
}

function initCursor() {
  const cursor = $('.cursor');
  if (!cursor || !finePointer || !hasGsap) return;
  const label = $('.cursor__label', cursor);
  const x = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
  const y = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
  addEventListener('pointermove', (e) => {
    x(e.clientX);
    y(e.clientY);
  });
  document.addEventListener('pointerover', (e) => {
    const withLabel = e.target.closest('[data-cursor]');
    const interactive = e.target.closest('a, button, input, [role="tab"]');
    cursor.classList.toggle('is-label', Boolean(withLabel));
    cursor.classList.toggle('is-hover', Boolean(interactive) && !withLabel);
    label.textContent = withLabel ? withLabel.dataset.cursor : '';
  });
  document.addEventListener('pointerleave', () => gsap.to(cursor, { autoAlpha: 0, duration: 0.2 }));
  document.addEventListener('pointerenter', () => gsap.to(cursor, { autoAlpha: 1, duration: 0.2 }));
}

function initMagnetic() {
  if (!animate || !finePointer) return;
  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });
}

function initProgressClock() {
  const btn = $('[data-progress-clock]');
  if (!btn) return;
  const hand = $('[data-pc-hand]');
  const ring = $('[data-pc-ring]');
  const C = 2 * Math.PI * 21;
  ring.style.strokeDasharray = String(C);
  const hiddenOnMobile = matchMedia('(max-width: 900px)');
  const update = () => {
    if (hiddenOnMobile.matches) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    hand.style.transform = `rotate(${p * 360}deg)`;
    ring.style.strokeDashoffset = String(C * (1 - p));
    btn.classList.toggle('is-visible', p > 0.04);
  };
  addEventListener('scroll', update, { passive: true });
  update();
  btn.addEventListener('click', () => scrollToTarget(0));
}

/* ==========================================================================
   Mobil alt naviqasiya (liquid glass)
   ========================================================================== */
function initTabbar() {
  const bar = $('[data-tabbar]');
  if (!bar) return;
  const blob = $('[data-tabbar-blob]', bar);
  const items = $$('.tabbar__item[data-tab-target]', bar);
  let current = null;

  const place = (item, instant) => {
    const x = item.offsetLeft;
    const width = item.offsetWidth;
    if (!hasGsap) {
      blob.style.transform = `translateX(${x}px)`;
      blob.style.width = `${width}px`;
      return;
    }
    if (instant || !animate) {
      gsap.set(blob, { x, width });
      return;
    }
    // damla maye kimi axır: uzanır, yastılanır, elastik oturur
    gsap.to(blob, { x, width, duration: 0.75, ease: 'elastic.out(1, 0.7)', overwrite: 'auto' });
    gsap.fromTo(blob, { scaleY: 1, scaleX: 1 }, { scaleY: 0.8, scaleX: 1.18, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: false });
  };

  const setActive = (id, instant = false) => {
    if (id === current) return;
    current = id;
    items.forEach((a) => {
      const on = a.dataset.tabTarget === id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    const act = items.find((a) => a.dataset.tabTarget === id);
    if (act) place(act, instant);
  };

  if (hasGsap) {
    items.forEach((a) => {
      const ids = [a.dataset.tabTarget, ...(a.dataset.tabAlso || '').split(' ').filter(Boolean)];
      ids.forEach((sid) => {
        const sec = document.getElementById(sid);
        if (!sec) return;
        ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setActive(a.dataset.tabTarget) });
      });
    });
  }
  setActive('top', true);
  addEventListener('resize', () => {
    const act = items.find((a) => a.dataset.tabTarget === current);
    if (act) place(act, true);
  });

  if (!animate) return;
  $$('.tabbar__item', bar).forEach((a) =>
    a.addEventListener('pointerdown', () => gsap.fromTo($('.tabbar__icon', a), { scale: 0.78 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', overwrite: true })),
  );
  gsap.from(bar, { yPercent: 170, duration: 1.1, ease: 'expo.out', delay: 0.5, clearProps: 'transform' });
}

/* ==========================================================================
   Start
   ========================================================================== */
async function main() {
  handleOptionalImages();
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  initSmoothScroll();
  initAnchors();
  initNav();
  initCursor();
  initProgressClock();
  initTracking();

  const menuPromise = loadMenu();
  const sitePromise = loadSite();
  initHero();
  await Promise.race([runLoader(), wait(6000)]);
  $('.loader')?.remove();
  lockScroll(false);

  // mətnlər sözlərə bölünməmişdən və animasiyalar başlamamışdan əvvəl yerinə düşür
  const site = await Promise.race([sitePromise, wait(2500).then(() => null)]);
  applyContent(site);
  applySettings(site);

  heroIntro();
  initMarquee();
  initWords();

  const data = await menuPromise;
  applyPrices(data, site);
  const menu = data ? indexMenu(data) : null;
  initCaesar(menu);
  initTimerStory(menu);
  initCalculator(menu);
  initMenu(data, site);
  initStack();
  initBranches();
  initCta();
  initReveals();
  initParallax();
  initDrift();
  initMagnetic();
  initNavThemes();
  initTabbar();

  if (hasGsap) {
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    addEventListener('load', () => ScrollTrigger.refresh());
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }
}

main().catch((err) => {
  console.error(err);
  $('.loader')?.remove();
});
