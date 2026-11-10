/**
 * Content-Disposition sarlavhasi. HTTP sarlavhasida faqat ASCII bo'lishi mumkin: kirill yoki boshqa harfli fayl nomi
 * (masalan "buyruq-12-К.docx") to'g'ridan-to'g'ri qo'yilsa Node xato tashlaydi va yuklab olish 500 bilan tugaydi.
 * Shuning uchun ASCII zaxira nom + RFC 5987 bo'yicha asl nom (filename*) beriladi.
 */
export function contentDisposition(name: string, inline = false): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
