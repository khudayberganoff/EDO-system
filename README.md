# EDO — Elektron Hujjat Aylanishi tizimi (WAFA GROUP)

EDO — **WAFA LEASING MCHJ** va **VAFO MOLIYA MCHJ MMT** uchun elektron hujjat aylanishi tizimi: hujjatlar va xatlar, ogohlantirish xatlari (CRM bilan bog'langan), kadrlar bo'limi, vazifalar doskasi va tashqi pochta bitta saytda.

Ishlab turgan tizim: <https://edo.wafaleasing.uz>

## Imkoniyatlar

| Bo'lim | Nima qiladi |
|---|---|
| **Bosh sahifa** | Hujjatlar soni ("Jami", "Imzo kutilmoqda", "Imzolangan"), bugungi sana (hafta kuni va hijriy sana bilan), kundalik vazifalar rejalashtiruvchisi |
| **Hujjatlar** | Hujjat yaratish, fayl versiyalari, ketma-ket tasdiqlash zanjiri (workflow), elektron imzo (hozircha MOCK provider), audit tarixi. "Ko'rib chiqilmoqda" va "Imzo kutilmoqda" bitta "Imzo kutilmoqda" holatiga birlashtirilgan |
| **Xatlar** | Chiquvchi xat, ma'lumotnoma, kiruvchi xatlar. Raqam har bo'lim/yil bo'yicha ketma-ket (`X-`, `MA-`, `OG1-`, `OG2-`). Qoralama → rahbar tasdig'i → QR kodli imzolangan xat. QR kod orqali ochiladigan ommaviy tekshiruv sahifasi (`/verify/:id`). Word (DOCX) va PDF ko'rinishida yuklab olish (PDF — LibreOffice orqali). QR kod Word faylida "По контуру" (wrapTight) bilan joylashadi |
| **Ogohlantirish xatlari** | 1-ogohlantirish va yakuniy ogohlantirish — kompaniya shablonlaridan avtomatik tuziladi (fuqaro / kompaniya + direktor F.I.Sh., Murobaha / Lizing matni, kechikkan oylar, asosiy qarz va xayriya to'lovi alohida). Mijoz, shartnoma va qarzdorlik **CRM'dan** tanlanadi |
| **Kadrlar** | Xodimlar kartotekasi (rasm va obyektivka fayli ixtiyoriy), bo'lim va lavozimlar, davomat, ta'tillar, buyruqlar (ishga qabul buyrug'i Word shablonidan), mehnat shartnomalari (fayl biriktirish ixtiyoriy), bayram kunlari, minnatdorchiliklar. "Mening HR" sahifasi har bir xodim uchun |
| **Doska** | Kanban kartochkalari (umumiy va shaxsiy doskalar). **Telegram bot** orqali vazifa qo'shish (shaxsiy chat, guruh, reply), `/mening`, mas'ulga bildirishnoma |
| **Kiruvchi pochta** | Tashqi pochta qutilarini (IMAP) ulash, xatlar va ilovalarni EDO ichida ko'rish |
| **Integratsiyalar** | API kalitlari va ommaviy API (`/api/public/v1`, `X-API-Key` bilan) |
| **Sozlamalar** | Foydalanuvchilar (yaratish, bloklash, parolni tiklash), rollarga bo'limlar bo'yicha ruxsat |
| **Boshqa** | Uch til (O'zbekcha, Ruscha, Inglizcha), ikki tashkilot (rahbariyat ular orasida almashadi), firma blankasi (Word) yuklash, o'chirilgan xatlar arxivi |

### Rollar va xavfsizlik

- Rollar: `ADMIN`, `MANAGER` (rahbariyat), `EMPLOYEE`. Bo'limlarga ruxsat Sozlamalar → "Ruxsatlar" bo'limida rol bo'yicha belgilanadi.
- Autentifikatsiya: JWT. `ADMIN`/`MANAGER` ikkala tashkilotga kira oladi, kirishda tashkilot tanlanadi; qolganlar faqat WAFA LEASING.
- Xodim rasmi, obyektivka va mehnat shartnomasi fayllari ommaviy `/uploads` da **emas**, yashirin `uploads/.private/` papkasida saqlanadi va faqat avtorizatsiya bilan beriladi (obyektivka va shartnoma — faqat rahbariyatga).
- So'rovlar tezligi cheklangan (throttler), kiruvchi ma'lumotlar DTO bo'yicha qat'iy tekshiriladi (`whitelist`).

## Texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, TanStack Query |
| Backend | NestJS 10, TypeScript, JWT (passport), Swagger |
| Baza | **PostgreSQL** + Prisma ORM (sxema `prisma db push` bilan yangilanadi) |
| Word / PDF | docxtemplater + PizZip (shablonlar), `docx` kutubxonasi, LibreOffice (DOCX → PDF) |
| Pochta | IMAP (`imapflow`) |
| Fayllar | Mahalliy `apps/api/uploads/` papkasi |
| Deploy | Docker (`Dockerfile`), bitta konteynerda API + tayyor frontend |

## Loyiha tuzilmasi

```text
edo-system/
├── apps/
│   ├── api/             # NestJS backend + Prisma (prisma/schema.prisma)
│   │   └── src/         # auth, users, documents, signatures, letters, hr, board,
│   │                    # daily-tasks, mail, settings, public-api, crm, audit-log
│   └── web/             # React + Vite frontend (src/pages, src/i18n, src/api)
├── packages/
│   └── shared-types/    # Backend va frontend uchun umumiy tiplar va enum'lar
├── templates/           # Word shablonlar (ogohlantirish, xat blanki, buyruq)
├── docs/
│   └── CRM-INTEGRATION.md   # CRM bilan integratsiya (o'qish roli, sozlash)
├── Dockerfile           # Production image (LibreOffice bilan)
├── .env.example         # Muhit o'zgaruvchilari namunasi
└── render.yaml          # Eski (Render.com) deploy konfiguratsiyasi
```

## Mahalliy ishga tushirish (dasturchi uchun)

**Talab:** Node.js 20+, PostgreSQL 14+ (xat/buyruqni PDF qilish uchun ixtiyoriy: LibreOffice).

```bash
# 1. Bo'sh PostgreSQL bazasi yarating (masalan: createdb edo), so'ng muhitni sozlang
cp .env.example apps/api/.env      # DATABASE_URL va JWT_SECRET ni tahrirlang

# 2. Paketlarni o'rnating (Prisma client avtomatik generatsiya qilinadi)
npm install

# 3. Backend (4000-port) — birinchi ishga tushishda baza sxemasi va boshlang'ich
#    foydalanuvchilar o'zi yaratiladi
npm run dev:api

# 4. Frontend (5173-port) — alohida terminalda
npm run dev:web
```

- Sayt: <http://localhost:5173> · API: <http://localhost:4000/api> · Swagger: <http://localhost:4000/api/docs>
- Production build: `npm run build`, ishga tushirish: `npm start` (API tayyor frontendni ham beradi).

### Boshlang'ich hisoblar

Bo'sh bazada server ishga tushganda avtomatik yaratiladi:

| Rol | Login | Parol |
|---|---|---|
| ADMIN | `admin@wafagroup.uz` | `Admin123!` |
| MANAGER | `manager@wafagroup.uz` | `Manager123!` |
| EMPLOYEE | `employee@wafagroup.uz` | `Employee123!` |

> **Muhim:** haqiqiy tizimda birinchi kirishdan so'ng bu parollarni albatta almashtiring (Sozlamalar → Foydalanuvchilar).

Shuningdek ikkita tashkilot (WAFA LEASING MCHJ, VAFO MOLIYA MCHJ MMT) avtomatik yaratiladi.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Majburiy | Tavsif |
|---|---|---|
| `DATABASE_URL` | ha | PostgreSQL ulanish manzili |
| `JWT_SECRET` | ha | JWT imzo kaliti (uzun, tasodifiy qiymat) |
| `JWT_EXPIRES_IN` | yo'q | Token muddati (standart `8h`) |
| `PORT` | yo'q | API porti (standart `4000`; Docker image'da `10000`) |
| `PUBLIC_APP_URL` | tavsiya | Saytning ommaviy manzili — xat QR kodlari shu manzilga ishora qiladi |
| `CORS_ORIGIN` | yo'q | Ruxsat etilgan manzillar (vergul bilan) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | yo'q | Oddiy xatlar uchun "AI bilan yozish" (kalit bo'lmasa mahalliy yordamchi ishlaydi) |
| `TELEGRAM_BOT_TOKEN` | yo'q | Telegram bot tokeni (BotFather). Berilmasa, administrator tokenni saytdan kiritadi (Integratsiyalar → Telegram bot) — baza ichida shifrlanib saqlanadi |
| `TELEGRAM_API_BASE` | yo'q | Telegram API manzili (standart `https://api.telegram.org`; sinov yoki mahalliy Bot API serveri uchun) |
| `CRM_DATABASE_URL` | yo'q | CRM bazasiga **faqat o'qish** ulanishi; berilmasa "CRM'dan tanlash" ko'rinmaydi |
| `CRM_PHONES_URL` | yo'q | Mijoz telefonlari manbai (standart `https://wafaleasing.uz/crm.html`, `off` — o'chirish) |
| `CRM_PHONES_FILE` | yo'q | Telefonlar JSON fayli (bo'sh bo'lmasa `CRM_PHONES_URL` dan ustun) |
| `VITE_API_URL` | yo'q | Frontend uchun API manzili (dev'da `http://localhost:4000`; production'da bo'sh — bitta server) |

## Word shablonlar (`templates/`)

| Fayl | Qayerda ishlatiladi |
|---|---|
| `1-OGOHLANTIRISH-NAMUNA.docx` | 1-ogohlantirish |
| `YAKUNIY-OGOHLANTIRISH-NAMUNA.docx` | Yakuniy ogohlantirish |
| `XAT-BLANK-NAMUNA.docx` | Xat va ma'lumotnoma (kompaniya o'z blankasini yuklamagan bo'lsa) |
| `ISHGA-QABUL-BUYRUQ-NAMUNA.docx` | Kadrlar: ishga qabul buyrug'i |

Shablonlardagi `{teg}` lar xat ma'lumotlari bilan almashtiriladi (`{kun} {oy} {yil}`, `{xat raqami}`, `{manzil}{manzil_son}`, `{kimga_old}{kimga}{kimga_son}`, `{telefon_raqam}`, `{shartnoma_turi}`, `{kechikkan_oy}`, `{oylik_to’lov}`, `{xayriya_summasi}`, `{qarzdorlik_summasi}`, `{%qr_kod}` va h.k.). Aniq ro'yxat `apps/api/src/letters/letters.service.ts` dagi `buildWarningDocx` / `buildDocxFromTemplate` izohlarida. Shablonni o'zgartirganda teglarni **bitta Word "run"** ichida yozing (formatni teg o'rtasida o'zgartirmang).

## Telegram bot (vazifalar doskasi)

1. Telegram'da **@BotFather** → `/newbot` → token oling.
2. Administrator tokenni **Integratsiyalar → Telegram bot** kartasiga kiritadi (yoki serverda `TELEGRAM_BOT_TOKEN`). Token tekshiriladi va webhook (`<PUBLIC_APP_URL>/api/telegram/webhook`, maxfiy sarlavha bilan) avtomatik ulanadi — `PUBLIC_APP_URL` **https://** bilan boshlanishi shart.
3. Har bir xodim **Vazifalar doskasi → Telegram** tugmasi orqali hisobini ulaydi (bir martalik 15 daqiqalik havola).
4. Botga shaxsiy chatda vazifa matnini yozing, yoki guruhda `/vazifa matn` (yoki xabarga javob qilib `/vazifa`). Matn ichida: `!yuqori` `!o'rta` `!past`, `#ertaga` `#bugun` `#2026-10-20`, `@Familiya` (mas'ul); `/vazifa` (matnsiz) — avval kimga ekanini tanlash, keyin matn yozish; muhimlik va muddat (Bugun/Ertaga/Kalendar) vazifa xabari ostidagi tugmalar bilan ham o'zgartiriladi. `/mening` — mening vazifalarim, `/vafo` — VAFO MOLIYA doskasi, `/uzish` — uzish.

## CRM bilan integratsiya

Ogohlantirish xatlari uchun mijoz, shartnoma raqami/sanasi/turi (Murobaha / Lizing), qarzdorlik va kechikkan kunlar CRM (Supabase) bazasidan **faqat o'qish** huquqi bilan olinadi; qarz CRM'dagi Monitoring → Portfel bilan bir xil hisoblanadi. Batafsil: [`docs/CRM-INTEGRATION.md`](docs/CRM-INTEGRATION.md).

## Deploy (Docker)

```bash
docker build -t edo .
docker run -d --name edo -p 10000:10000 \
  -e DATABASE_URL=postgresql://user:parol@host:5432/edo \
  -e JWT_SECRET=<uzun-tasodifiy-qiymat> \
  -e PUBLIC_APP_URL=https://edo.example.uz \
  -v edo-uploads:/app/apps/api/uploads \
  edo
```

- Image ichida LibreOffice va shriftlar bor (PDF uchun), frontend build qilingan va API tomonidan beriladi.
- **`uploads` papkasini doimiy volume'ga ulang** — yuklangan fayllar, firma blankasi va xodim hujjatlari shu yerda; aks holda har yangilanishda yo'qoladi.
- Baza sxemasi server ishga tushgandan keyin avtomatik yangilanadi (`prisma db push`), shuning uchun alohida migratsiya buyrug'i shart emas.
- HTTPS va domen uchun oldiga reverse proxy (Caddy / nginx) qo'ying.
- Bazani muntazam zaxiralang (`pg_dump`) va `uploads` papkasini ham nusxalang.

Hozirgi ishlab turgan tizim o'z VPS serverida Docker'da ishlaydi (Caddy orqali HTTPS, kod `main` ga qo'shilganda server o'zi yangilanadi, kunlik zaxira). `render.yaml` — Render.com'dagi eski (bepul tarif) konfiguratsiya, hozir ishlatilmaydi.

## Eski Windows launcher

`EDO-START.vbs`, `launcher.cjs`, `launcher.html`, `1-SOZLASH.bat`, `2-ISHGA-TUSHIRISH.bat` — SQLite davridagi mahalliy ishga tushirish vositasi. Baza PostgreSQL'ga o'tgani uchun u **hozirgi sxema bilan ishlamaydi**; dasturchilar yuqoridagi "Mahalliy ishga tushirish" bo'limidan foydalansin.
