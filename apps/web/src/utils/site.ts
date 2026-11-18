/**
 * Ikki sayt - bitta tizim: `call.*` manzili faqat Call-markaz, qolgan manzillar (edo.*) odatdagi EDO.
 * Mahalliy sinov uchun VITE_SITE_MODE=call ham ishlaydi.
 */
export const IS_CALL_SITE =
  (import.meta as any).env?.VITE_SITE_MODE === "call" || window.location.hostname.toLowerCase().startsWith("call.");

// Brauzer va Telegram sarlavhasida "EDO" emas, "WAFA Call-markaz" ko'rinsin (server ham index.html'da almashtiradi)
if (IS_CALL_SITE && typeof document !== "undefined") document.title = "WAFA Call-markaz";
