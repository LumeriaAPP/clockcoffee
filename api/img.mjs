// Vercel funksiyası, məntiq lib/routes.mjs-dədir
import { vercel } from '../lib/http.mjs';
import { imgHandler } from '../lib/routes.mjs';

export default vercel(imgHandler);
