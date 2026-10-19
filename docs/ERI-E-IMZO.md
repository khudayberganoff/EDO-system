# ERI (E-IMZO) orqali kirish — o'rnatish yo'riqnomasi

Manba: [qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc) (E-IMZO integratsiya yo'riqnomasi).

## Qismlar

| Qism | Vazifasi |
|---|---|
| **E-IMZO dasturi** (foydalanuvchi kompyuterida) | ERI kalitini o'qiydi, parolni so'raydi, PKCS#7 imzo yaratadi. Maxfiy kalit kompyuterdan chiqmaydi |
| **EDO** (brauzer + server) | E-IMZO bilan WebSocket orqali gaplashadi, challenge olib, imzoni e-imzo-server ga tekshirtiradi |
| **e-imzo-server** (Java, JRE 8) | Challenge beradi, imzo va sertifikatni tekshiradi, sertifikat holatini VPN orqali so'raydi |
| **VPN** (`vpn.e-imzo.uz:3443`, sinov: `testvpn.e-imzo.uz:2443`) | Sertifikat holati (OCSP) va vaqt tamg'asi xizmati |

**API-KEY**, **VPN kaliti** va **SiteID** — uch xil narsa. API-KEY brauzerdagi sahifaga (domen uchun) beriladi, VPN kaliti faqat e-imzo-server uchun. ERI orqali kirish uchun SiteID (ID-karta mobil) kerak emas.

## 1. e-imzo-server ni olish

- Rasmiy build faqat E-IMZO ishlab chiqaruvchisi orqali (yopiq Telegram kanal), **litsenziya shartnomasi** asosida beriladi. Ochiq yuklab olish havolasi yo'q.
- Internetdagi norasmiy JAR va Docker image'larni **ishlatmang** (o'zgartirilgan bo'lishi mumkin; ishlab chiqaruvchi javobgar emas).
- Serverga **VPN kaliti** ham beriladi (alohida to'plam). Sinov va ishchi (production) kalitlarni aralashtirmang.

## 2. e-imzo-server ni ishga tushirish

Talab: JRE 1.8, VPN serverga chiquvchi ulanish (faqat O'zbekistondan ochiladi), VPN kaliti va sozlama fayllari `e-imzo-server.jar` yonida.

`config.properties` (asosiy maydonlar):

```
listen.ip=0.0.0.0
listen.port=8080
vpn.tls.enabled=yes
vpn.connect.host=vpn.e-imzo.uz
vpn.connect.port=3443
vpn.key.file.path=keys/<domen>-<sana>.key
vpn.key.password=<parol>
vpn.truststore.file.path=keys/vpn.jks
tsp.jks.file.path=keys/truststore.jks
```

Ishga tushirish: v1.x — `java -Dfile.encoding=UTF-8 -jar e-imzo-server.jar config.properties`; v2.x — `java -Dfile.encoding=UTF-8 -jar e-imzo-server.jar start --config config.properties`.
Docker uchun JRE asosi sifatida `amazoncorretto:8-alpine3.22-jre` misol qilib keltiriladi (rasmiy image yo'q — o'zingiz yig'asiz).

Tekshirish: `GET /ping` (VPN vaqti, `yourIP`, `vpnKeyInfo`), `GET /info` (versiya, ishonchli sertifikatlar).

**Xavfsizlik:** e-imzo-server portini tashqariga ochmang. EDO unga ichki tarmoqdan (masalan `http://e-imzo-server:8080`) murojaat qiladi; brauzer e-imzo-server bilan to'g'ridan-to'g'ri gaplashmaydi.

## 3. EDO da yoqish

**Tashqi tizimlar → ERI (E-IMZO)** kartasi:
- **Server manzili** — e-imzo-server ichki manzili;
- **Domen** — sayt domeni (`Host` sarlavhasi shu bilan yuboriladi);
- **API-KEY** — ixtiyoriy: E-IMZO 6 kalitni domen bo'yicha o'zi yuklaydi; sinovda «Developer mode» yoqiladi. Ishchi domen uchun kalit har bir domen/subdomen uchun alohida beriladi (IP manzilga berilmaydi).

Keyin **Sozlamalar → Foydalanuvchilar** da har bir foydalanuvchiga **JSHSHIR** (14 raqam, sertifikatdagi `1.2.860.3.16.1.2`) kiriting. Foydalanuvchi kompyuterida E-IMZO dasturi ishlab turishi kerak.

## 4. Sinov rejimi

- Sinov sayti: `https://test.e-imzo.uz/demo/`. Sinov VPN: `testvpn.e-imzo.uz:2443` (alohida kalitlar bilan), sinov ERI kalitlari faqat sinov serveri bilan ishlaydi.
- E-IMZO dasturi menyusida **«Режим разработчика»** (Developer mode) — sinov domen/IP uchun API-KEY siz ishlaydi. Ishchi domenga almashtirmaydi.

## 5. Xato kodlari (`POST /backend/auth`)

| Kod | Ma'nosi |
|---|---|
| 1 | Muvaffaqiyatli |
| -1 | Sertifikat holatini tekshirib bo'lmadi (ko'pincha VPN ishlamayapti) |
| -5 | Imzolash vaqti ruxsat oralig'idan tashqarida (standart 5 daqiqa) |
| -10 | Imzo noto'g'ri |
| -11 / -12 | Sertifikat yaroqsiz / imzolangan sanada yaroqsiz |
| -20 | Challenge topilmadi yoki eskirgan (TTL 120 s, bir martalik) |
| -21…-23 | Imzo/vaqt tamg'asi xeshi yoki sertifikati noto'g'ri |
| -24 / -25 | Sertifikat siyosati yoki CA ruxsat etilmagan |

`ocsp url is disallowed` — sinov va ishchi sertifikat/VPN aralashib ketgan.

## Hozircha qo'llab-quvvatlanmaydi

Faqat **PFX** (fayldagi) kalitlar bilan kirish ishlaydi. ID-karta (NFC mobil), USB-token (`ckc`) va BAIK kalitlari bilan kirish keyinroq qo'shilishi mumkin.
