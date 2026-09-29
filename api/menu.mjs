// Vercel serverless funksiyası: menyunu Clopos-dan canlı çəkir.
// Nəticə CDN-də 30 dəqiqə keşlənir; xəta olsa sayt data/menu.json-a keçir.
import { DEFAULT_MENU_URL, scrapeMenu } from '../scripts/scrape-menu.mjs';

export default async function handler(req, res) {
  try {
    const data = await scrapeMenu(process.env.MENU_URL || DEFAULT_MENU_URL, { timeoutMs: 15000 });
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: err.message });
  }
}
