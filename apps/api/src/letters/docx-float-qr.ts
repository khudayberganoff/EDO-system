// eslint-disable-next-line @typescript-eslint/no-var-requires
const PizZip = require("pizzip");

const WRAP_TIGHT =
  '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/>' +
  '<wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/>' +
  '<wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapTight>';

/**
 * docxtemplater image moduli rasmni matn qatoriga (wp:inline) joylaydi. Word'da bu
 * "В тексте" bo'lib, QR kod matnni itarib yuboradi. Bu funksiya moduli yaratgan rasmlarni
 * (docPr descr="image") "Обтекание текстом: По контуру" (wp:anchor + wrapTight) ko'rinishiga
 * o'tkazadi: QR kod joyida qoladi, matn uning atrofidan aylanib o'tadi. Shablonning o'z
 * rasmlari (logotip va h.k.) o'zgarmaydi.
 */
export function floatGeneratedImages(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);
  const file = zip.file("word/document.xml");
  if (!file) return docxBuffer;
  const xml: string = file.asText();
  let changed = false;
  const out = xml.replace(/<wp:inline\b[^>]*>([\s\S]*?)<\/wp:inline>/g, (whole: string, inner: string, at: number) => {
    if (!/<wp:docPr\b[^>]*descr="image"/.test(inner)) return whole;
    const extent = inner.match(/<wp:extent\b[^>]*\/>/)?.[0];
    const effect = inner.match(/<wp:effectExtent\b[^>]*\/>/)?.[0] ?? '<wp:effectExtent l="0" t="0" r="0" b="0"/>';
    const docPr = inner.match(/<wp:docPr\b[^>]*\/>/)?.[0];
    const frame = inner.match(/<wp:cNvGraphicFramePr>[\s\S]*?<\/wp:cNvGraphicFramePr>|<wp:cNvGraphicFramePr\b[^>]*\/>/)?.[0] ?? "<wp:cNvGraphicFramePr/>";
    const graphic = inner.match(/<a:graphic\b[\s\S]*<\/a:graphic>/)?.[0];
    if (!extent || !docPr || !graphic) return whole;
    changed = true;
    // QR kod belgisi turgan qatordan darhol pastroqqa qo'yiladi: imzo qatoridagi F.I.Sh. (tabulyatsiyadan
    // keyingi matn) QR ostida qolib ketmaydi, Word va LibreOffice (PDF) da bir xil ko'rinadi.
    const offsetH = 0;
    const offsetV = 250000;
    return (
      '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" ' +
      'behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="character"><wp:posOffset>' + offsetH + '</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="line"><wp:posOffset>' + offsetV + '</wp:posOffset></wp:positionV>' +
      extent + effect + WRAP_TIGHT + docPr + frame + graphic + "</wp:anchor>"
    );
  });
  if (!changed) return docxBuffer;
  zip.file("word/document.xml", out);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
