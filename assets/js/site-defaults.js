/* ==========================================================================
   Sayt, server və admin panel üçün ortaq standart ayarlar
   ========================================================================== */

// Menyu tabları: admin panel heç nə seçməyibsə, bu əsas məhsullar göstərilir
export const TABS = [
  { id: 'qehve', title: 'Qəhvə', sections: ['hot-coffee'], pick: ['Espresso', 'Americano', 'Cappuccino', 'Coffee latte', 'FlatWhite', 'Raff Coffee', 'Spanish Coffee', 'Türk qəhvəsi'] },
  { id: 'soyuq', title: 'Soyuq içkilər', sections: ['cold-coffee'], pick: ['İced Latte', 'İced Americano', 'İced Raff', 'Cold brew', 'Espresso Tonic', 'İced Spanish Coffee', 'Mojito', 'Frappuccino caramel'] },
  { id: 'sendvic', title: 'Sendviç & tost', sections: ['sendvicler', 'tostlar'], pick: ['Toyuqlu çiabatta sendviç', 'Pastramili fokaccia', 'Qızıl balıqlı baget sendviç', 'Tuna balıqlı çovdar baget', 'Ətli pastramili tost', 'Toyuqlu tost', 'Qızıl balıqlı tost'] },
  { id: 'salat', title: 'Salat & bowl', sections: ['salatlar', 'bowl'], pick: ['Klassik sezar salatı', 'Şnitsel salatı', 'Qızıl balıq ilə təzə göyərti salatı', 'Toyuqlu bowl', 'Smoked chicken bowl', 'Pastramili protein bowl'] },
  { id: 'kruasan', title: 'Kruasan', sections: ['kruasan-sendvicleri', 'baton'], pick: ['Kurasan toyuqlu', 'Kurasanda pastrami', 'Kurasanda qızıl balıq', 'Kurasan hisə verilmiş toyuq ilə', 'Kurasan klassik'] },
  { id: 'desert', title: 'Desertlər', sections: ['classic-dessert'], pick: ['San Sebastian', 'Tiramisu', 'Honey cake', 'Nutella Crepe', 'Snickers cake', 'PaxlavaCheesecake'] },
  { id: 'seher', title: 'Səhər yeməyi', sections: ['breakfast'], pick: [] },
];

export const DEFAULT_SETTINGS = {
  firstHour: 6,
  extraHour: 1,
  open: '08:00',
  close: '23:00',
  announcementOn: false,
  announcement: '',
};

// Azərbaycan hərflərini müqayisə üçün sadələşdirir (İ/ı/ə və s.)
export const fold = (s) =>
  String(s || '')
    .replace(/İ/g, 'I')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ə/g, 'e')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');

// "08:00" üçün "08:00-dən", "09:00" üçün "09:00-dan" (sonuncu tələffüz olunan rəqəmə görə ahəng)
const ONES = { 1: 'dən', 2: 'dən', 3: 'dən', 4: 'dən', 5: 'dən', 6: 'dan', 7: 'dən', 8: 'dən', 9: 'dan' };
const TENS = { 10: 'dan', 20: 'dən', 30: 'dan', 40: 'dan', 50: 'dən' };
export function fromSuffix(time) {
  const [h, m] = String(time).split(':').map(Number);
  const n = m ? m : h;
  if (!n) return 'dan';
  return n % 10 ? ONES[n % 10] : TENS[n] || 'dan';
}
export const hoursText = (open, close) => `${open}-${fromSuffix(open)} ${close}-dək`;
