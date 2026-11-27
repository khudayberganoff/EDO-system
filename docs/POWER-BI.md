# Power BI: lidlar bo'yicha diagrammali hisobot

Call-markaz Power BI uchun doimiy havola beradi: **Sozlamalar → Integratsiyalar → Power BI** (faqat administrator).
Havola CSV jadval qaytaradi — oxirgi 365 kundagi barcha lidlar, har bir lid bitta qator
(Excel hisobotidagi «Lidlar» varag'i bilan bir xil ustunlar). Boshqa davr: havola oxiriga `&days=730` qo'shing (1100 gacha).

> Havolada maxfiy token bor. Sizib chiqsa — kartadagi «Yangilash» bilan almashtiring va Power BI manbasini yangilang.

## 1. Ulash (Power BI Desktop)

1. *Get Data (Ma'lumot olish) → Web (Veb)* → havolani qo'ying → OK.
2. Kirish turi: **Anonymous** → *Connect*.
3. *Transform Data*: `Kelgan kun` → **Date**, `Kelgan vaqt`, `Birinchi aloqa`, `Qayta aloqa vaqti`, `Uchrashuv vaqti`,
   `Natija vaqti` → **Date/Time**, raqamli ustunlar (`Javob vaqti (ish soati)`, `Qayta aloqalar soni`, `Summa (so'm)`,
   `Uchrashuv belgilangan`, `Shartnoma`, `Sifatsiz`) → **Decimal / Whole number**. *Close & Apply*.

## 2. O'lchovlar (DAX)

```DAX
Lidlar = COUNTROWS(feed)
Aloqaga chiqilgan = COUNTROWS(FILTER(feed, NOT ISBLANK(feed[Birinchi aloqa])))
O'rtacha javob (ish soati) = AVERAGE(feed[Javob vaqti (ish soati)])
Qayta aloqalar = SUM(feed[Qayta aloqalar soni])
Uchrashuv+ = SUM(feed[Uchrashuv belgilangan])
Shartnomalar = SUM(feed[Shartnoma])
Sifatsiz = SUM(feed[Sifatsiz])
Konversiya % = DIVIDE([Shartnomalar], [Lidlar])
```

## 3. Diagrammalar

| Diagramma | Turi | Maydonlar |
|---|---|---|
| Kunlar bo'yicha lidlar | Line chart | X: `Kelgan kun`, Y: `Lidlar`, `Aloqaga chiqilgan` |
| Manbalar | Pie / Donut | Legend: `Manba`, Values: `Lidlar` |
| Bosqichlar voronkasi | Funnel | Category: `Bosqich`, Values: `Lidlar` |
| Rad etish sabablari | Bar chart | Axis: `Rad etish sabablari` (bir nechta sabab `;` bilan — Power Query'da *Split Column → By Delimiter → Rows*), Values: `Lidlar` |
| Loyiha turlari | Clustered bar | Axis: `Loyiha turi`, Values: `Lidlar`, `Shartnomalar` |
| Asosiy ko'rsatkichlar | Card | `Lidlar`, `O'rtacha javob (ish soati)`, `Konversiya %` |
| Operatorlar | Table | `Mas'ul`, `Lidlar`, `O'rtacha javob (ish soati)`, `Shartnomalar` |
| Davr filtri | Slicer | `Kelgan kun` (Between) |

## 4. Avtomatik yangilash

*Publish* → Power BI Service → Dataset (Semantic model) → *Settings → Data source credentials*: Anonymous →
*Scheduled refresh*: yoqing, kuniga bir necha vaqt (masalan 09:00, 13:00, 18:00).

## Excel hisobot

Call-markaz → Lidlar → **Hisobot**: davrni tanlab `.xlsx` yuklab olinadi — varaqlar: Xulosa, Lidlar, Kunlar,
Manbalar, Rad etish sabablari, Loyiha turlari. Power BI'ga Excel faylni ham ulash mumkin (*Get Data → Excel*),
lekin u avtomatik yangilanmaydi — doimiy hisobot uchun yuqoridagi havoladan foydalaning.
