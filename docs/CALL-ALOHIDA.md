# Call-markazni alohida tizimga ajratish

Call-markaz (call.wafagroup.uz) EDO'dan butunlay ajratiladi:

| | EDO (edo.wafagroup.uz) | Call-markaz (call.wafagroup.uz) |
|---|---|---|
| Server (konteyner) | `edo-app`, `SITE_MODE=edo` | `call-app`, `SITE_MODE=call` |
| Baza | hozirgi baza | yangi `edo_call` bazasi |
| Login / parollar | EDO xodimlari | Call-markaz xodimlari (alohida ro'yxat) |
| Maxfiy kalit (`JWT_SECRET`) | hozirgisi | yangi - EDO sessiyasi Call-markazda ishlamaydi |

Kod bitta (bitta Docker image), tizim turi `SITE_MODE` o'zgaruvchisi bilan tanlanadi:

- `SITE_MODE=call` - faqat Call-markaz: lidlar, qo'ng'iroqlar, CRM mijozlari, kalendar, sozlamalar, IP-telefoniya, Facebook Lead Ads. EDO API'lari yopiq. Call-markazning o'z Telegram boti ("WAFA Call-markaz") Sozlamalar → Integratsiyalar'da ulanadi va webhook'i `/api/calls/telegram/webhook`; u ulanmaguncha xabarlar EDO boti orqali (faqat yuborish) ketadi.
- `SITE_MODE=edo` - faqat EDO: Call-markaz API'lari (`/api/calls`, `/api/telephony`, `/api/meta`) yopiq, operator roli yo'q.
- berilmasa (`both`) - eski umumiy rejim (o'tish davrida shu ishlaydi).

> Kod yangilanishi bilan hech narsa o'zgarmaydi: `SITE_MODE` berilmaguncha tizim avvalgidek ishlaydi.
> Ajratish quyidagi qadamlar bajarilganda amalga oshadi.

---

## 0. Zaxira nusxa

Boshlashdan oldin bazaning yangi zaxira nusxasini oling (kunlik zaxira bor, lekin ajratishdan oldin yana bir marta).

## 1. Yangi baza

Mavjud Postgres serverida `edo_call` bazasi yaratiladi (parol ekranga chiqmaydi):

```bash
docker exec edo-app node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query('create database edo_call')).then(()=>{console.log('baza yaratildi');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

## 2. Sozlamalar (`/opt/edo/.env`)

```bash
cd /opt/edo && cp .env .env.bak-$(date +%F)
# Yangi baza manzili - hozirgisidan faqat baza nomi o'zgaradi
grep -q '^CALL_DATABASE_URL=' .env || sed -n -E 's#^DATABASE_URL=(.*/)[^/?]+(\?.*)?$#CALL_DATABASE_URL=\1edo_call\2#p' .env >> .env
# Call-markaz uchun alohida maxfiy kalit
grep -q '^CALL_JWT_SECRET=' .env || echo "CALL_JWT_SECRET=$(openssl rand -hex 32)" >> .env
grep -c '^CALL_' .env   # 2 chiqishi kerak
```

## 3. `docker-compose.yml` ga `call` xizmati

`/opt/edo/docker-compose.yml` dagi `services:` ichiga (`edo` xizmatidan keyin) qo'shiladi. `extends` - `edo` xizmatining image/build, tarmoq va boshqa sozlamalarini oladi, faqat quyidagilar farq qiladi:

```yaml
  call:
    extends:
      service: edo
    container_name: call-app
    environment:
      SITE_MODE: call
      DATABASE_URL: ${CALL_DATABASE_URL}
      JWT_SECRET: ${CALL_JWT_SECRET}
      PUBLIC_APP_URL: https://call.wafagroup.uz
      PUBLIC_URL: https://call.wafagroup.uz
      CORS_ORIGIN: https://call.wafagroup.uz
    volumes:
      - call-uploads:/app/apps/api/uploads
```

Fayl oxiridagi `volumes:` bo'limiga `call-uploads:` qatorini qo'shing (bo'lim bo'lmasa - yarating). Tekshirish:

```bash
docker compose -p edo config --services   # edo va call chiqishi kerak
```

## 4. Ma'lumotlarni ko'chirish

Call-markaz konteyneri birinchi marta ishga tushishidan **oldin** bajariladi:

```bash
cd /opt/edo
docker compose -p edo build call 2>/dev/null || true
( set -a; . ./.env; set +a
  docker compose -p edo run --rm --no-deps \
    -e SOURCE_DATABASE_URL="$DATABASE_URL" -e SOURCE_JWT_SECRET="$JWT_SECRET" \
    call node apps/api/scripts/split-call-db.cjs )
```

Ko'chiriladi: tashkilotlar; administratorlar, rahbariyat va operatorlar (parollari bilan - xuddi shu login/parol bilan kiradi); lidlar, qo'ng'iroqlar, CRM qo'ng'iroq natijalari, mijozlarning qo'lda kiritilgan telefonlari; Facebook Lead Ads (ulanish, sahifalar, formalar, jurnal) va telefoniya sozlamalari. Tokenlar yangi kalit bilan qayta shifrlanadi. Skriptni qayta ishga tushirish xavfsiz.

## 5. Call-markaz konteynerini ishga tushirish

```bash
docker compose -p edo up -d call
docker logs --tail 20 call-app    # "Call-markaz API ... (SITE_MODE=call)" chiqishi kerak
```

Qo'ng'iroq yozuvlarini ko'chirish (yozuvlar bo'lsa):

```bash
docker cp edo-app:/app/apps/api/uploads/.private/recordings /tmp/edo-recordings 2>/dev/null \
  && docker exec call-app mkdir -p /app/apps/api/uploads/.private \
  && docker cp /tmp/edo-recordings call-app:/app/apps/api/uploads/.private/recordings \
  && rm -rf /tmp/edo-recordings
```

## 6. Caddy: call.wafagroup.uz -> yangi konteyner

Caddyfile'dagi `call.wafagroup.uz { ... }` blokida `reverse_proxy edo-app:10000` ni `reverse_proxy call-app:10000` ga almashtiring, tekshirib qayta ishga tushiring (avvalgidek: `caddy adapt` bilan tekshirish, so'ng `docker restart supabase-caddy`).

## 7. Tekshirish

- call.wafagroup.uz ga EDO'dagi parol bilan kiring: lidlar, qo'ng'iroqlar, Mijozlar (CRM), Sozlamalar -> Foydalanuvchilar (faqat Call-markaz xodimlari), Integratsiyalar (Facebook - "Ulangan", "Meta'dan oxirgi xabar").
- Meta va ATS'dagi manzillar o'zgarmaydi (call.wafagroup.uz), qayta sozlash shart emas.

## 8. EDO'ni faqat EDO rejimiga o'tkazish

`docker-compose.yml` dagi `edo` xizmatining `environment:` bo'limiga `SITE_MODE: edo` qo'shing va:

```bash
docker compose -p edo up -d edo
```

## 9. Avtomatik yangilanish

Server `main` yangilanganda `edo` ni qayta yig'adi. `call` ham yangilanishi uchun yangilash buyrug'ida `edo` bilan birga `call` ham bo'lishi kerak (masalan `docker compose -p edo up -d --build edo call`).

## 10. EDO bazasini tozalash (ixtiyoriy, bir necha kundan keyin)

Call-markaz alohida to'liq ishlashiga ishonch hosil qilingach, EDO bazasidan Call-markaz ma'lumotlari o'chiriladi va EDO'dagi operator hisoblari nofaol qilinadi:

```bash
cd /opt/edo
( set -a; . ./.env; set +a
  docker compose -p edo run --rm --no-deps -e PURGE_SOURCE=yes -e SOURCE_DATABASE_URL="$DATABASE_URL" \
    call node apps/api/scripts/split-call-db.cjs --purge-source )
```

## Orqaga qaytarish

Caddyfile'da `call.wafagroup.uz` ni yana `edo-app:10000` ga qaytaring va `edo` xizmatidan `SITE_MODE` ni olib tashlang - tizim eski umumiy rejimga qaytadi (EDO bazasi 10-qadam bajarilmaguncha o'zgarmaydi).
