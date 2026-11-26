# FreePBX + WAFA Call-markaz: qo'ng'iroqlar, yozuvlar va raqam terish

> **Eslatma:** Call-markaz tomoni, o'rnatuvchi va `freepbx-edo-sync.sh` skripti soxta CDR ma'lumotlari bilan sinalgan
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
- `curl` (bor), `ffmpeg` — ixtiyoriy, yozuvni ~10 baravar kichraytiradi (`yum install ffmpeg` yoki `apt install ffmpeg`).

## 1. FreePBX'da suhbatlarni yozib olishni yoqish

Eng oddiy yo'l — yo'nalishlar bo'yicha: *Connectivity → Inbound Routes* va *Outbound Routes* → yo'nalishni oching →
**Call Recording = Force** → Submit → **Apply Config**. Yoki har bir ichki raqam bo'yicha (versiyaga qarab menyu nomlari farq qilishi mumkin):

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

## 3. Bitta buyruq bilan o'rnatish (tavsiya etiladi)

1. Call-markaz: **Sozlamalar → Integratsiyalar → IP-telefoniya → "FreePBX: bitta buyruq bilan ulash"**.
   Chiquvchi yo'nalishda prefiks bo'lsa (*Connectivity → Outbound Routes → Dial Patterns → prefix*, masalan `9`), uni maydonga yozing.
2. **Nusxalash** tugmasini bosing.
3. FreePBX serveriga PuTTY (SSH) bilan `root` sifatida kiring, buyruqni qo'ying (sichqonchaning o'ng tugmasi) va Enter bosing.

O'rnatuvchi o'zi: CDR bazasini tekshiradi, iloji bo'lsa `ffmpeg` o'rnatadi, skriptni `/usr/local/bin/freepbx-edo-sync.sh` ga
(Call-markaz manzili va token yozilgan holda) yozadi, har daqiqalik `cron` qo'shadi va bir marta ishga tushiradi.
Oxirida **"Tayyor!"** chiqadi. Token yangilansa — yangi buyruqni nusxalab qayta ishga tushiring.

Server vaqt mintaqasi muhim emas: skript qo'ng'iroq vaqtini server mintaqasi bilan birga yuboradi.

## 4. Qo'lda o'rnatish (muqobil)

Skript manbasi: `apps/api/src/telephony/freepbx-edo-sync.sh`. Uni `/usr/local/bin/` ga ko'chirib, boshidagi `URL`, `TOKEN`,
`OUT_PREFIX` ni to'ldiring, `chmod 700` qiling va cron qo'shing:

```bash
echo '* * * * * root /usr/local/bin/freepbx-edo-sync.sh >> /var/log/edo-sync.log 2>&1' | sudo tee /etc/cron.d/edo-sync
```

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
