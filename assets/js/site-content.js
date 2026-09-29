// Sayt mətnlərinin format qaydaları. Standart mətnlər index.html-dədir (data-cms
// atributları), burada yalnız sadə işarələrin HTML-ə çevrilməsi var.
// Həm sayt, həm də admin panel bu faylı işlədir.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Parametrlərdən avtomatik dolan yerlər (tarif, iş saatları, il) */
export const TOKENS = {
  '{tarif1}': '<span data-tariff="first">6</span>',
  '{tarif2}': '<span data-tariff="extra">1</span>',
  '{saatlar}': '<span data-open-hours>08:00-dən 23:00-dək</span>',
  '{il}': '<span data-year>2026</span>',
};

export const MARKER_HELP = '*maili* · **qalın** · ~əlyazma şrifti~ · #vurğu# · _kiçik yazı_ · yeni sətir = alt sətir';

/** Admin paneldə yazılan mətni saytdakı HTML-ə çevirir (yalnız icazə verilən işarələr) */
export function renderRich(value) {
  let html = escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~([^~]+)~/g, '<em class="script">$1</em>')
    .replace(/#([^#]+)#/g, '<span>$1</span>')
    .replace(/_([^_]+)_/g, '<small>$1</small>')
    .replace(/\n/g, '<br>');
  for (const [token, tag] of Object.entries(TOKENS)) html = html.split(token).join(tag);
  return html;
}

/** Saytdakı HTML-i admin paneldə göstərmək üçün işarəli mətnə çevirir */
export function htmlToMarkers(html) {
  return String(html || '')
    .replace(/<span data-tariff="first"[^>]*>[^<]*<\/span>/gi, '{tarif1}')
    .replace(/<span data-tariff="extra"[^>]*>[^<]*<\/span>/gi, '{tarif2}')
    .replace(/<span data-open-hours[^>]*>[^<]*<\/span>/gi, '{saatlar}')
    .replace(/<span data-year[^>]*>[^<]*<\/span>/gi, '{il}')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<em class="script"[^>]*>([\s\S]*?)<\/em>/gi, '~$1~')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<small[^>]*>([\s\S]*?)<\/small>/gi, '_$1_')
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '#$1#')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** data-cms elementinin standart (HTML-dəki) dəyəri */
export function defaultValue(el) {
  const kind = el.dataset.cmsKind || 'text';
  if (kind === 'url') return el.getAttribute('href') || '';
  if (kind === 'waurl') return (el.getAttribute('href') || '').replace(/^https?:\/\/wa\.me\//i, '');
  if (kind === 'rich') return htmlToMarkers(el.innerHTML);
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
