# FreePBX + WAFA Call-markaz: qo'ng'iroqlar, yozuvlar va raqam terish

> **Eslatma:** Call-markaz tomoni va `freepbx-edo-sync.sh` skripti soxta CDR ma'lumotlari bilan sinalgan
> (kiruvchi, javobsiz, chiquvchi, ichki qo'ng'iroq, yozuv, takror yuborilmaslik, xato bo'lganda qayta urinish).
> Haqiqiy FreePBX serverida sinalmagan: birinchi ishga tushirishda logni kuzating (5-bo'lim).

## Nima ulanadi

| Imkoniyat | Qanday ishlaydi |
|---|---|
| Qo'ng'iroqlar ro'yxati (kiruvchi / chiquvchi / javobsiz) | Skript har daqiqada FreePBX CDR bazasidan yangi qo'ng'iroqlarni o'qib, Call-markazga yuboradi |
| Suhbat yozuvlari ("Tinglash") | FreePBX yozgan fayl mp3 ga siqilib, qo'ng'iroqqa biriktiriladi (FreePBX'dagi fayl o'chirilmaydi) |
| Javobsiz kiruvchi qo'ng'iroqdan "Yangi lead" | Avtomatik (Integratsiyalar → IP-telefoniya'da yoqilgan bo'lsa) |
| Qo'ng'iroq qaysi operatorga tushgani | FreePBX ichki raqami (100, 101...) xodim kartochkasidagi "Ichki raqam" bilan solishtiriladi |
| Tizimdan raqam terish | MicroSIP FreePBX ichki raqamiga ulangan bo'lsa — raqamni bosish kifoya (Sozlamalar → Integratsiyalar → "Raqam terish (MicroSIP)") |

```
Mijoz ──► SIP-trunk ──► FreePBX ──► operator (MicroSIP, ichki raqam 100/101...)
                          │
                          │ har daqiqada (cron): CDR bazasi + yozuv fayllari
                          ▼
              https://call.wafagroup.uz/api/telephony/webhook    (qo'ng'iroq)
              https://call.wafagroup.uz/api/telephony/recording  (yozuv)
```

FreePBX dialplan'iga (extensions_custom.conf) **tegilmaydi** — FreePBX yangilanganda hech narsa buzilmaydi.

## Talablar

- FreePBX 14 yoki yangiroq (Asterisk 13+), serverga `root` (SSH) bilan kirish.
- FreePBX serveridan internetga HTTPS chiqishi: `curl -I https://call.wafagroup.uz` javob berishi kerak.
- Server vaqt mintaqasi **Asia/Tashkent**: `timedatectl` (bo'lmasa `timedatectl set-timezone Asia/Tashkent`).
  FreePBX'da ham: *Settings → Advanced Settings → PHP Timezone* = `Asia/Tashkent`.
- `curl` (bor), `ffmpeg` — ixtiyoriy, yozuvni ~10 baravar kichraytiradi (`yum install ffmpeg` yoki `apt install ffmpeg`).

## 1. FreePBX'da suhbatlarni yozib olishni yoqish

FreePBX versiyasiga qarab menyu nomlari biroz farq qilishi mumkin:

- *Applications → Extensions* → har bir operator ichki raqami → **Advanced** → *Recording Options*:
  **Inbound External Calls = Force**, **Outbound External Calls = Force** → Submit.
- Kiruvchi yo'nalish (*Connectivity → Inbound Routes*) → **Call Recording = Force** (yoki "Yes").
- **Apply Config** (yuqoridagi qizil tugma).

Yozuvlar `/var/spool/asterisk/monitor/YYYY/MM/DD/` papkasiga tushadi. Mijozni suhbat yozib olinishi haqida ogohlantiring
(kirish xabari) — bu qonuniy talab.

## 2. Tokenni olish

Call-markaz: **Sozlamalar → Integratsiyalar → IP-telefoniya** kartasidagi webhook manzilidan `token=` dan keyingi qiymat.
Token maxfiy: uni chatga yoki skrinshotga yubormang. Sizib chiqsa, kartadagi "Yangilash" tugmasi bilan almashtiring
va skriptdagi qiymatni ham yangilang.

## 3. Skriptni o'rnatish

Repozitoriydagi `docs/ats/freepbx-edo-sync.sh` faylini FreePBX serveriga ko'chiring (masalan `scp` bilan) yoki
`nano` da yangi fayl ochib, mazmunini qo'ying:

```bash
sudo nano /usr/local/bin/freepbx-edo-sync.sh      # mazmunini qo'ying
sudo chmod 700 /usr/local/bin/freepbx-edo-sync.sh # faqat root o'qiy oladi (ichida token bor)
```

Fayl boshidagi sozlamalarni to'ldiring:

| O'zgaruvchi | Qiymat |
|---|---|
| `URL` | `https://call.wafagroup.uz/api/telephony` |
| `TOKEN` | 2-bo'limdagi token |
| `OUT_PREFIX` | Chiquvchi qo'ng'iroqda tashqi liniya uchun raqam oldidan teriladigan prefiks bo'lsa (masalan `9`), aks holda bo'sh |

Qo'lda bir marta ishga tushirib tekshiring:

```bash
sudo /usr/local/bin/freepbx-edo-sync.sh
```

Birinchi ishga tushishda faqat **oxirgi 10 daqiqadagi** qo'ng'iroqlar olinadi (eski tarix yuklanmaydi).
Xato chiqmasa — keyingi bo'limga o'ting.

## 4. Har daqiqada avtomatik ishlash (cron)

```bash
echo '* * * * * root /usr/local/bin/freepbx-edo-sync.sh >> /var/log/edo-sync.log 2>&1' | sudo tee /etc/cron.d/edo-sync
sudo chmod 644 /etc/cron.d/edo-sync
```

Qo'ng'iroq tugagach ~1–2 daqiqada Call-markazda paydo bo'ladi (yozuv fayli to'liq yozilib bo'lishi uchun 1 daqiqa kutiladi).

## 5. Tekshirish

1. Tashqi raqamdan kompaniya raqamiga qo'ng'iroq qiling, operator javob bersin, 10–15 soniya gaplashing.
2. 2 daqiqadan keyin Call-markaz → **Qo'ng'iroqlar**: qator paydo bo'lishi, "Operator" ustunida xodim ismi, **Tinglash** ishlashi kerak.
3. Javob bermasdan qo'ng'iroq qiling — "Lidlar"da "Yangi lead" yaratiladi.
4. MicroSIP'dan (yoki tizimdagi raqamni bosib) tashqi raqamga qo'ng'iroq qiling — chiquvchi sifatida ko'rinadi.

Log: `sudo tail -f /var/log/edo-sync.log`

| Logdagi yozuv | Sabab va yechim |
|---|---|
| `Yuborildi: ...` | Hammasi joyida |
| `Yuborilmadi (403)` | Token noto'g'ri — 2-bo'limdan qayta nusxa oling |
| `Yuborilmadi (000)` | Serverdan internetga chiqib bo'lmayapti (firewall, DNS) |
| `Rad etildi (400)` | Qo'ng'iroqda tashqi raqam yo'q — Call-markaz: Integratsiyalar → IP-telefoniya → "Oxirgi kelgan so'rov" |
| `MySQL xatosi` | Skript root sifatida ishlamayapti yoki CDR bazasi boshqa nomda |
| `yozuv yuborilmadi` | 1-bo'limda yozib olish yoqilmagan yoki fayl topilmadi |

Xato bo'lsa (tarmoq, token) skript keyingi daqiqada **o'sha qo'ng'iroqdan boshlab** qayta urinadi — qo'ng'iroqlar yo'qolmaydi.

## 6. Operatorlarni bog'lash

Call-markaz → **Sozlamalar → Foydalanuvchilar** → har bir operator kartochkasida **Ichki raqam** = FreePBX'dagi
Extension raqami (masalan `100`). Shunda qo'ng'iroqlar ro'yxatida qaysi operator gaplashgani ko'rinadi.

## Keyingi bosqich (hozir yo'q)

- **AMI orqali**: MicroSIP'siz, tizimning o'zidan qo'ng'iroq boshlash va kiruvchi qo'ng'iroq jiringlayotganda
  operator ekraniga lid kartochkasini chiqarish. Buning uchun FreePBX'da Call-markaz serveriga ochiq AMI foydalanuvchisi
  (Settings → Asterisk Manager Users) va xavfsiz ulanish (VPN yoki IP cheklovi) kerak bo'ladi.
