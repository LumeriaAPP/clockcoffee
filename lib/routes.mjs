// API marşrutları: həm Vercel funksiyaları (api/*.mjs), həm də lokal server.mjs bunu işlədir.
import { stats, track } from './analytics.mjs';
import { COOKIE, adminConfigured, checkPassword, clearCookie, createSession, ipKey, sessionCookie, verifySession } from './auth.mjs';
import { adminCatalog, deleteProduct, getConfig, getImage, getLog, logEvent, publicSite, reorder, resetTab, saveContent, savePrice, saveProduct, saveSettings, setVisibility } from './catalog.mjs';
import { json } from './http.mjs';
import { StoreMissingError, cmd, run, storeKind } from './store.mjs';
import { DEFAULT_SETTINGS } from '../assets/js/site-defaults.js';

/* GET /api/site: saytın admin paneldən idarə olunan hissəsi */
export async function siteHandler() {
  try {
    return json(200, await publicSite(), { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=60' });
  } catch (err) {
    if (!(err instanceof StoreMissingError)) console.error(err);
    return json(200, { tabs: {}, custom: [], prices: {}, content: {}, settings: DEFAULT_SETTINGS, updatedAt: null, fallback: true });
  }
}

/* POST /api/track: anonim statistika */
export async function trackHandler(req) {
  try {
    return await track(req);
  } catch (err) {
    if (!(err instanceof StoreMissingError)) console.error(err);
    return { status: 204 };
  }
}

/* GET /api/img?id=: əl ilə əlavə olunan məhsulun şəkli */
export async function imgHandler(req) {
  const img = await getImage(req.query.id);
  if (!img) return json(404, { error: 'Şəkil tapılmadı' });
  return { status: 200, headers: { 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable' }, body: img.buffer };
}

/* /api/admin?action=... yalnız sessiya ilə işləyir */
export async function adminHandler(req) {
  const action = String(req.query.action || '');
  const method = req.method;
  const authed = verifySession(req.cookies[COOKIE]);

  if (action === 'status') return json(200, { configured: adminConfigured(), authed, store: storeKind() });

  if (action === 'login' && method === 'POST') {
    if (!adminConfigured()) return json(503, { error: 'Admin şifrəsi hələ təyin edilməyib (ADMIN_PASSWORD).', code: 'NO_PASSWORD' });
    const key = `cc:login:${ipKey(req.ip)}`;
    let attempts = 0;
    try {
      attempts = Number(await cmd('GET', key)) || 0;
    } catch {
      /* baza yoxdursa limit tətbiq olunmur */
    }
    if (attempts >= 8) return json(429, { error: 'Çox yanlış cəhd oldu. 15 dəqiqə sonra yenidən yoxlayın.' });
    if (!checkPassword(req.body?.password)) {
      try {
        await run([['INCR', key], ['EXPIRE', key, 900]]);
      } catch {
        /* keç */
      }
      return json(401, { error: 'Şifrə yanlışdır' });
    }
    try {
      await cmd('DEL', key);
      await logEvent('Admin panelə giriş edildi');
    } catch {
      /* keç */
    }
    const { token, maxAge } = createSession();
    return json(200, { ok: true }, { 'set-cookie': sessionCookie(token, maxAge, req.secure) });
  }

  if (action === 'logout' && method === 'POST') return json(200, { ok: true }, { 'set-cookie': clearCookie(req.secure) });

  if (!authed) return json(401, { error: 'Giriş tələb olunur' });
  // CSRF qoruması: dəyişikliklər yalnız panelin öz sorğularından (xüsusi başlıq) qəbul olunur
  if (method !== 'GET' && req.headers['x-cc-admin'] !== '1') return json(403, { error: 'Qadağandır' });

  const b = req.body || {};
  try {
    if (method === 'GET') {
      if (action === 'stats') return json(200, await stats(req.query.range));
      if (action === 'catalog') return json(200, await adminCatalog());
      if (action === 'settings') return json(200, (await getConfig()).settings);
      if (action === 'content') return json(200, (await getConfig()).content);
      if (action === 'log') return json(200, await getLog());
    } else if (method === 'POST') {
      if (action === 'product') return json(200, await saveProduct(b));
      if (action === 'delete') return json(200, await deleteProduct(b.id));
      if (action === 'visibility') return json(200, await setVisibility(b.tab, b.id, Boolean(b.on), String(b.label || '').slice(0, 80)));
      if (action === 'reorder') return json(200, await reorder(b.tab, b.ids));
      if (action === 'reset') return json(200, await resetTab(b.tab));
      if (action === 'settings') return json(200, await saveSettings(b));
      if (action === 'price') return json(200, await savePrice(b));
      if (action === 'content') return json(200, await saveContent(b));
    }
  } catch (err) {
    if (err.status === 400) return json(400, { error: err.message });
    throw err;
  }
  return json(404, { error: 'Tapılmadı' });
}
