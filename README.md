# EDO — Elektron Hujjat Aylanishi tizimi (WAFA GROUP)

EDO — WAFA GROUP учун электрон ҳужжат айланиши тизими. Лойиҳа Docker талаб қилмайди: frontend React/Vite, backend NestJS ва маълумотлар базаси SQLite орқали локал компьютерда ишлайди.

## ⚡ Windows — битта яширин launcher

**Талаб:** Node.js LTS 20+ ўрнатилган бўлиши керак. Docker ва PostgreSQL талаб қилинмайди.

1. Архивни исталган папкага чиқаринг.
2. **`EDO-START.vbs`** файлини икки марта босинг.
3. Биринчи ишга туширишда `npm install`, Prisma ва SQLite база автоматик тайёрланади.
4. Backend `4000` портда, frontend `5173` портда фон режимида ишлайди.
5. Браузер автоматик очилади.

### Кириш маълумотлари

- ADMIN: `admin@wafagroup.uz` / `Admin123!`
- MANAGER: `manager@wafagroup.uz` / `Manager123!`
- EMPLOYEE: `employee@wafagroup.uz` / `Employee123!`

`1-SOZLASH.bat` ва `2-ISHGA-TUSHIRISH.bat` backward compatibility учун қолдирилган; улар ҳам `EDO-START.vbs` ни яширин режимда ишга туширади.

## Архитектура

```text
aedo-system/
a├── apps/
│   ├── api/          # NestJS backend + Prisma + SQLite
│   └── web/          # React + Vite + TypeScript
├── packages/
│   └── shared-types/ # Backend/frontend умумий типлари
├── EDO-START.vbs     # Ягона яширин launcher
├── launcher.cjs      # Setup ва server orchestration
└── launcher.html     # WAFA loading интерфейси
```

## Технологиялар

| Қатлам | Технология |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript, JWT |
| База | SQLite + Prisma ORM |
| Auth | JWT + RBAC |
| Файллар | Локал `apps/api/uploads/` папкаси |

## Docker ҳақида

Ушбу версиядан Docker ва PostgreSQL конфигурацияси тўлиқ олиб ташланган. Лойиҳани ишга тушириш учун Docker Desktop, PostgreSQL server ёки `docker compose` керак эмас.

SQLite база файли `apps/api/prisma/dev.db` сифатида локал сақланади.

## Қўлда ишга тушириш

Агар launcher ўрнига қўлда ишлатиш керак бўлса:

```bash
npm install
npm run prisma:generate --workspace=apps/api
npm run prisma:migrate --workspace=apps/api -- --name init
npm run seed --workspace=apps/api
npm run dev:api
npm run dev:web
```

## API

- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api/docs`
- Web: `http://localhost:5173`


Launcher technical note: Frontend Vite and Backend NestJS are launched directly through node.exe and their CLI JavaScript entrypoints. npm.cmd is not used for long-running services.

## Render.com'да deploy qilish (bepul)

Loyihada tayyor `render.yaml` bor — Render buni avtomatik o'qib, API'ni ham,
PostgreSQL bazasini ham o'zi sozlab beradi.

1. https://render.com — GitHub akkaunt bilan kiring.
2. **New +** → **Blueprint** → shu repo'ni (`EDO-system`) tanlang.
3. Render `render.yaml`'ni topib, "edo-system" (web) va "edo-db" (Postgres,
   free tier) xizmatlarini avtomatik yaratadi. **Apply**'ni bosing.
4. Birinchi build/deploy 5-10 daqiqa vaqt oladi (npm install + build).
5. Deploy tugagach, `https://edo-system.onrender.com` manzilida sayt ochiladi.
6. Birinchi kirish uchun (seed orqali avtomatik yaratiladi):
   - Admin: `admin@wafagroup.uz` / `Admin123!`
   - Menejer: `manager@wafagroup.uz` / `Manager123!`
   - Xodim: `employee@wafagroup.uz` / `Employee123!`

   **Muhim:** birinchi kirishdan so'ng bu parollarni albatta almashtiring.

### Bepul tarif haqida bilish kerak bo'lgan narsalar
- Free web service 15 daqiqa harakatsizlikdan so'ng "uxlab qoladi" — keyingi
  so'rov birinchi marta 30-60 soniya sekin ochiladi (keyin tez ishlaydi).
- Yuklangan fayllar (`apps/api/uploads`) **doimiy saqlanmaydi** — har yangi
  deploy'da tozalanadi (Render free tarifida persistent disk yo'q). Muhim
  fayllar uchun keyinchalik S3/Cloudinary kabi tashqi saqlash ulash tavsiya
  etiladi.
- Free Postgres 90 kundan so'ng Render tomonidan o'chirilishi mumkin — vaqti
  bilan yangilab turish kerak.

### Kelajakdagi yangilanishlar
Kod GitHub repo'siga push qilinishi bilan Render **avtomatik** qayta build
va deploy qiladi — qo'lda hech narsa qilish shart emas.
