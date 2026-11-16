# Facebook / Instagram Lead Ads → Call-markaz

Meta (Facebook va Instagram) lid formalaridan kelgan arizalar **call.wafagroup.uz** dagi «Lidlar» Kanban'iga
bir necha soniyada avtomatik tushadi. Oraliq servis (ApixDrive, Make, Zapier) ishlatilmaydi:
Meta to'g'ridan-to'g'ri bizning serverga xabar yuboradi (webhook), server esa lid ma'lumotini Graph API orqali oladi.

Sozlash joyi: **call.wafagroup.uz → Sozlamalar → Integratsiyalar → Facebook Lead Ads** (faqat administrator).

---

## 1. Meta tomonida (bir marta)

1. **developers.facebook.com → My Apps → Create App**. Turi: **Business**. Ilova WAFA Business Manager nomidan ochiladi.
2. Ilovaga mahsulotlar qo'shing: **Facebook Login for Business** va **Webhooks**.
3. **App settings → Basic**:
   - **App Domains**: `call.wafagroup.uz`
   - **Privacy Policy URL** — majburiy (busiz ilova Live rejimga o'tmaydi).
   - Shu sahifadagi **App ID** va **App Secret** ni EDO kartochkasining 1-qadamiga kiriting va saqlang.
4. **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**:
   `https://call.wafagroup.uz/api/meta/oauth/callback`
5. **Webhooks** → obyekt **Page** → **Subscribe to this object**:
   - **Callback URL**: `https://call.wafagroup.uz/api/meta/webhook`
   - **Verify Token**: EDO kartochkasidagi «Verify Token» qiymati (nusxa tugmasi bor)
   - **Verify and Save** bosilgach, ro'yxatdan **leadgen** maydoniga **Subscribe** qiling.
6. Kerakli ruxsatlar (App Review → Permissions and Features; ilova faqat o'z sahifalaringiz uchun va
   ulaydigan odam ilovada admin/developer bo'lsa, odatda **Standard Access** yetadi):
   `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`,
   `pages_manage_ads`, `ads_read`, `business_management`.
   Meta paneli **Advanced Access** so'rasa — App Review va Business Verification'dan o'tiladi.
7. Ilovani **Live** rejimga o'tkazing. Development rejimida haqiqiy lidlar kelmaydi.
8. **Business Manager → Business settings → Integrations → Leads Access**: sahifa uchun yangi ilovaga
   lidlarga kirish huquqini bering. Bu qadam qolib ketsa, webhook keladi, lekin lid ma'lumoti xato bilan qaytadi
   (Jurnalda «Xato» bo'lib ko'rinadi).

> App Secret va tokenlar faqat serverda, **shifrlangan** holda saqlanadi; sahifada qayta ko'rsatilmaydi.
> Ularni chatga, xatga yoki skrinshotga qo'ymang.

## 2. EDO'da ulash

1. **1-qadam — Meta ilovasi**: App ID va App Secret'ni kiritib **Saqlash**. Shu yerda Meta paneliga
   kiritiladigan qiymatlar (App Domains, Redirect URI, Webhook URL, Verify Token) nusxa tugmalari bilan ko'rsatilgan.
2. **2-qadam — Facebook akkaunti**: **Facebook'ni ulash** → Facebook oynasida kiring va ruxsatlarni tasdiqlang.
   Qaytgandan keyin siz boshqaradigan sahifalar ro'yxati chiqadi.
3. **3-qadam — Sahifalar**: kerakli sahifada **Lidlarni qabul qilish** (sahifa webhook'ka obuna qilinadi).
   So'ng **Formalar va moslama**:
   - **Barcha formalar (keyin yaratiladiganlari ham)** — yoki har bir formani alohida belgilang;
   - har bir forma uchun **Moslama**: forma savoli → tizim maydoni (Ism / Telefon / Izoh / Olinmasin);
   - lid tushadigan **bosqich**, **tashkilot** va **mas'ul xodim** (formada «Sahifa sozlamasi» — sahifa standarti).
4. **4-qadam — Qoidalar**:
   - shu raqamli ochiq lid bo'lsa, yangisini yaratmasdan mavjudiga izoh qo'shish (standart: yoqilgan);
   - yangi lid haqida Telegram xabari (mas'ulga, u bo'lmasa — operatorlarga; Telegram bot sozlangan bo'lishi kerak).

## 3. Lid qanday yaratiladi

| Forma maydoni | Tizimda |
|---|---|
| `full_name` (yoki `first_name` + `last_name`) | Ism / kompaniya |
| `phone_number` | Telefon (`+998XXXXXXXXX` ko'rinishiga keltiriladi) |
| qolgan savol-javoblar, forma, kampaniya, ad set, reklama, platforma, ariza vaqti | Izoh |
| — | Manba: «Meta Ads (Instagram)» yoki «Meta Ads (Facebook)» |

- Lid kartochkasida forma, kampaniya, ad set va reklama nomi alohida ko'k blokda ko'rinadi.
- **Dublikat yo'q**: har bir lidning `leadgen_id` si saqlanadi; Meta xabarni qayta yuborsa, ikkinchi lid yaratilmaydi.
- **Forma tanlanmagan** bo'lsa (va «Barcha formalar» o'chiq bo'lsa) lid o'tkazib yuboriladi — Jurnalda «O'tkazib yuborildi».
  Formani keyin yoqsangiz, Jurnaldagi ↺ tugmasi bilan shu lidni qayta olish mumkin.
- Raqam CRM mijozlari ro'yxatida (qo'lda kiritilgan raqamlar) bo'lsa, izohga ogohlantirish yoziladi.
- **Kampaniya nomlari** uchun `ads_read` ruxsati kerak; u bo'lmasa lid baribir yaratiladi, faqat kampaniya/reklama nomlarisiz.

## 4. Xatolar va kuzatish

- Kartochkada: holat (Ulanmagan / Ulangan / Qayta ulash kerak), bugungi va jami lidlar, oxirgi lid vaqti,
  navbatdagi xabarlar, oxirgi xato.
- **Jurnal (oxirgi 50 ta xabar)**: har bir kelgan lid — Qabul qilindi / O'tkazib yuborildi / Xato / Navbatda.
- Graph API vaqtincha xato bersa — 5 martagacha, oraliq oshib boruvchi qayta urinish (5 s, 20 s, 1 daq, 3 daq).
  Oxiri xato bo'lsa — Jurnalda va kartochkada ko'rinadi, ↺ bilan qo'lda qayta urinish mumkin.
- **Token bekor bo'lsa** (Facebook paroli o'zgargan, ruxsat olib tashlangan — Meta xato kodi 190) — holat
  **«Qayta ulash kerak»** ga o'tadi va administratorlarga Telegram xabari boradi. **Qayta ulash** tugmasini bosing.
- Server o'chib qolsa, Meta xabarni qayta yuboradi; serverda navbatda qolgan xabarlar u yongach o'zi qayta ishlanadi.

## 5. Sinov

1. Meta panelidagi Webhooks → **Verify and Save** muvaffaqiyatli o'tadi.
2. **developers.facebook.com/tools/lead-ads-testing** — sahifa va formani tanlab test lid yuboring:
   5 soniya ichida Call-markazda «Yangi lead» ustunida paydo bo'ladi.
3. Shu lidni yana yuborsangiz — dublikat yaratilmaydi.
4. O'chirilgan formadan kelgan lid tushmaydi (Jurnalda «O'tkazib yuborildi»).
5. Sahifani uzsangiz lidlar tushmay qoladi; Facebook'ni qayta ulab, sahifani yana yoqish mumkin.

## 6. Server sozlamasi (ixtiyoriy)

Odatda hammasi saytdan kiritiladi. Muhit o'zgaruvchilari berilsa, saytdagidan ustun turadi:

| O'zgaruvchi | Ma'nosi |
|---|---|
| `META_APP_ID`, `META_APP_SECRET` | Meta ilovasi |
| `META_VERIFY_TOKEN` | Webhook tekshiruv satri (berilmasa avtomatik yaratiladi) |
| `META_GRAPH_VERSION` | Graph API versiyasi (standart `v26.0`) |
| `META_LOGIN_CONFIG_ID` | Facebook Login for Business konfiguratsiyasi ID'si (odatda saytda, 1-qadamda kiritiladi; berilsa, ruxsatlar shundan olinadi) |
| `META_SCOPES` | Ruxsatlar ro'yxati (vergul bilan), standart yuqoridagi 7 ta |
| `META_PUBLIC_URL`, `META_REDIRECT_URI` | Manzillarni qo'lda berish (odatda so'rovdan aniqlanadi) |
| `CALL_PUBLIC_URL` | Telegram xabaridagi havola uchun call sayti manzili |

## 7. Keyingi bosqich (hali qilinmagan)

Lid bosqichi o'zgarganda (Sifatli lid, Uchrashuv, Shartnoma) Meta **Conversions API** ga hodisa yuborish —
reklama sifatli lidlarga optimallashishi uchun. Buning uchun har bir lidning `meta_leadgen_id` si allaqachon saqlanmoqda.
