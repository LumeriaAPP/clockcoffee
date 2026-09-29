// Vercel funksiyası, məntiq lib/routes.mjs-dədir
import { vercel } from '../lib/http.mjs';
import { siteHandler } from '../lib/routes.mjs';

export default vercel(siteHandler);
