# Clock & Coffee: vebsayt

Timer konseptli kofe məkanı üçün parallax scroll saytı. Qiymətlər əl ilə yazılmır,
[elektron menyudan](https://clockcoffee.clopos.menu/az/1/products) avtomatik çəkilir.

## İşə salmaq

```bash
npm start
```

Sayt `http://localhost:5173` ünvanında açılır. Heç bir paket quraşdırmaq lazım deyil (Node 18+).

## Qiymətlər necə yenilənir

- `server.mjs` `/api/menu` ünvanında menyunu Clopos-dan canlı çəkir, 30 dəqiqəlik keşlə.
- Hər uğurlu yeniləmə `data/menu.json` faylına da yazılır. Server əlçatan olmayanda
  (məsələn statik hostinqdə) sayt həmin faylı oxuyur.
- Əl ilə yeniləmək: `npm run scrape`
- Məcburi yeniləmə: `http://localhost:5173/api/menu?refresh`

Saytda yalnız əsas məhsullar göstərilir. Standart seçim `assets/js/site-defaults.js`
faylındakı `TABS` siyahısındadır; admin paneldən istənilən məhsulu göstərmək, gizlətmək,
sıralamaq və əl ilə yeni məhsul əlavə etmək olar.

## Şəkillər

Orijinal şəffaf PNG-lər `assets/img/src/` qovluğundadır, sayt isə onların yüngül WebP versiyalarını işlədir. Yeni şəkil əlavə etdikdən sonra:

```bash
python scripts/optimize-images.py
```

| Fayl | Harada istifadə olunur |
| --- | --- |
| hero-cup | hero saatının mərkəzi, Timer və Coffee kartı |
| iced-latte, croissant, coffee-beans, coffee-branch, sandwich | hero orbiti, sürüşən dekorlar, "masaya gələn" sifarişlər |
| caesar | Sezar bölməsi |
| alarm-clock | Timer saniyəölçəni və son CTA |
| work, meet | Məkan kartları |

## Admin panel

Ünvan: gizli yol `/cc-7k2p` (məs. https://clockcoffee.vercel.app/cc-7k2p). `/admin` ünvanı yoxdur (404),
səhifə axtarış sistemlərinə bağlıdır (`X-Robots-Tag: noindex`). Əsas qoruma şifrədir; ünvanı dəyişmək üçün
`cc-7k2p/` qovluğunun adını dəyişib `vercel.json`-dakı başlıq qaydasını yeniləmək kifayətdir.

Bölmələr:

- **Ümumi baxış**: ziyarətçilər, səhifə baxışları, WhatsApp/zəng/xəritə klikləri, hazırda saytda olanlar,
  cihazlar, trafik mənbələri, saatlar üzrə aktivlik, menyuda baxılan bölmələr (bu gün / 7 / 30 / 90 gün).
- **Məhsullar**: Clopos məhsullarını saytda göstər/gizlət, sırala; şəkilli yeni məhsul əlavə et, redaktə et, sil.
  Qiymətə klikləyib əl ilə dəyişmək olar: həmin məhsulda paneldəki qiymət göstərilir, "Clopos qiymətinə qaytar"
  düyməsi isə avtomatik qiymətə qaytarır. Toxunulmayan məhsullar həmişə elektron menyudan yenilənir.
- **Sayt mətnləri**: saytdakı bütün yazılar (hero, konsept, Timer addımları, menyu başlıqları, məkan kartları,
  filiallar, CTA, footer) və əlaqə məlumatları (telefon, WhatsApp, Instagram, xəritə linkləri).
- **Parametrlər**: Timer tarifi, iş saatları, saytın yuxarısında elan zolağı.
- **Fəaliyyət**: paneldə edilən son dəyişikliklər.

### Sayt mətnləri necə işləyir

Standart mətnlər `index.html`-dədir: hər redaktə oluna bilən element `data-cms="açar"` (lazım olanda
`data-cms-kind` və `data-cms-label`) atributu ilə işarələnib. Panel saytın HTML-ini oxuyub sahələri özü
qurur, ona görə yeni mətn əlavə etmək üçün sadəcə HTML-də yeni `data-cms` yazmaq kifayətdir.
Dəyişdirilən mətnlər bazada (`cc:config.content`) saxlanılır və `/api/site` ilə sayta gəlir.

Format işarələri (`assets/js/site-content.js`): `*maili*`, `**qalın**`, `~əlyazma şrifti~`, `#vurğu#`,
`_kiçik yazı_`, yeni sətir. Avtomatik dolan yerlər: `{tarif1}`, `{tarif2}`, `{saatlar}`, `{il}`.
Növlər (`data-cms-kind`): `text` (standart), `rich`, `url`, `tel`, `wa`, `waurl`, `count`.

Statistika anonimdir: IP və şəxsi məlumat saxlanmır, brauzer təsadüfi ID göndərir, botlar sayılmır.

### Vercel-də bir dəfəlik quraşdırma

1. Vercel layihəsi → **Storage** → **Create Database** → **Upstash for Redis** (pulsuz plan) → layihəyə **Connect**.
   `KV_REST_API_URL` və `KV_REST_API_TOKEN` avtomatik əlavə olunur.
2. **Settings → Environment Variables**: `ADMIN_PASSWORD` (ən azı 6 simvol, Production).
3. Yenidən deploy: `npx vercel@latest deploy --prod --yes`

Baza qoşulmayanda sayt standart ayarlarla işləyir, panel isə xəbərdarlıq göstərir.

### Lokalda

`.env.local` faylında `ADMIN_PASSWORD=...` yazın. Lokal serverdə məlumatlar `data/local-store.json`
faylında saxlanılır (Redis əmrləri təqlid olunur). Bu iki fayl deploy-a və git-ə düşmür.

## Performans qaydaları (mobil)

Telefonda scroll donmasın deyə:

- Lenis (smooth scroll) yalnız siçan/touchpad olan cihazlarda işə düşür. Toxunuşlu ekranda doğma scroll
  işləyir, çünki Lenis-in toxunuş dinləyiciləri scroll-u JS-in bitməsini gözləməyə məcbur edir.
- Animasiyalarda yalnız `transform` və `opacity` dəyişir. `box-shadow`, gradient bucağı, CSS dəyişəni ilə
  animasiya hər kadr səhifəni yenidən çəkdirir.
- İçində `<text>` olan `<svg>`-nin özünü fırlatmayın: Chrome hər kadr mətni yenidən ölçür. Div-i fırladın
  (hero yazı halqası, Sezar nişanı belədir).
- Scroll ilə hərəkət edən, `drop-shadow` filtrli PNG-lərdə `will-change: transform` olmalıdır.
- Sonsuz dekorativ animasiyalar element ekrandan çıxanda dayanır (`whileVisible`, hero dövrəsi).

## Qovluq quruluşu

```
index.html                  səhifə
assets/css/style.css        dizayn sistemi və bölmələr
assets/js/main.js           animasiyalar (GSAP + ScrollTrigger + Lenis), menyu, kalkulyator, statistika
assets/js/site-defaults.js  sayt və admin üçün ortaq standart ayarlar (TABS, tarif, iş saatları)
assets/js/site-content.js   mətn format işarələri (sayt və admin üçün ortaq)
cc-7k2p/                    admin panel, gizli ünvan (index.html, admin.css, admin.js)
api/                        Vercel funksiyaları: menu, site, track, img, admin
lib/                        server məntiqi: anbar (Redis/fayl), giriş, statistika, kataloq
scripts/scrape-menu.mjs     Clopos menyu scraper-i
scripts/optimize-images.py  PNG → WebP
server.mjs                  lokal server (+ eyni API-lər)
data/menu.json              son çəkilmiş menyu
```

## Deploy (Vercel)

Canlı: https://clockcoffee.vercel.app (layihə: `fidanorxan423-1000s-projects/clockcoffee`)

```bash
npx vercel@latest deploy --prod --yes
```

Qlobal quraşdırılmış köhnə CLI (50.x) deploy zamanı 500 xətası verdi; `npx vercel@latest` işləyir.
Vercel-də `/api/menu` serverless funksiyadır (`api/menu.mjs`), nəticə CDN-də 30 dəqiqə keşlənir.
`.vercelignore` şəkil orijinallarını və Iconly SVG fayllarını deploy-a daxil etmir.

## İkonlar

Iconly Essential pulsuz dəstindən (web.iconly.pro, `is_free`) seçilib; orijinallar `assets/icons/iconly/`,
saytda `index.html`-dəki SVG spraytı işlənir. Iconly şərtləri pulsuz ikonların kommersiya istifadəsini
açıq yazmır. Pullu plan alınmayacaqsa, footer-dəki "İkonlar: Iconly" krediti saxlanılmalıdır.
