# EDO <-> CRM: ogohlantirish xatlari uchun mijoz va qarzdorlik ma'lumoti

EDO "Ogohlantirish" xati shaklida **"CRM'dan tanlash"** bo'limi bor: kechikkan shartnoma
tanlansa, xatga mijoz turi (fuqaro/kompaniya) va nomi, shartnoma raqami/sanasi, oylik to'lov,
to'lov kuni, kechikkan kunlar (DPD) va muddati o'tgan qarzdorlik avtomatik tushadi.

EDO CRM bazasiga (Supabase `supabase-db`) **faqat o'qish** huquqi bilan ulanadi. Qarzdorlik
CRM'dagi **Monitoring -> Portfel** bilan bir xil hisoblanadi (`apps/api/src/crm/crm-ledger.ts`:
crm.html'dagi `mon_buildChain`, `mon_computeLedger`, `mon_daysOverdue` ning ko'chirmasi, "months"
reja va "payments" to'lovlari bo'yicha xronologik FIFO). Mijoz ma'lumoti EDO'da saqlanmaydi.

Eslatma: CRM'dagi **telefon** bazada emas (crm.html ichidagi `MON_PHONES` ro'yxati) va
**manzil** yo'q, shuning uchun bu ikki maydon EDO'da qo'lda to'ldiriladi. Telefonlar CRM'da
jadvalga (masalan `customers.phone`) ko'chirilsa, EDO uni avtomatik olishi mumkin.
Hozircha faqat eski portfel (`customers`, `vafo_customers`) o'qiladi; CRM'da yangi yopilgan
lidlardan hosil bo'lgan shartnomalar (`crm_leads`/`crm_intakes`) hali kiritilmagan.

## 1. CRM bazasida (bir marta, `postgres` foydalanuvchisi bilan)

Faqat o'qiydigan rol, faqat 4 ta jadvalga:
```sql
CREATE ROLE edo_reader LOGIN PASSWORD '<KUCHLI_PAROL>';
ALTER ROLE edo_reader SET default_transaction_read_only = on;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM edo_reader;
GRANT USAGE ON SCHEMA public TO edo_reader;
GRANT SELECT ON public.customers, public.payments, public.vafo_customers, public.vafo_payments TO edo_reader;
```
Jadvallarda RLS yoqilgan; hozirgi `USING (true)` siyosatlari `edo_reader` ga ham tegishli
(o'qishga ruxsat). Agar siyosatlar `authenticated` bilan cheklansa, qo'shing:
```sql
CREATE POLICY edo_read ON public.customers FOR SELECT TO edo_reader USING (true);
CREATE POLICY edo_read ON public.payments FOR SELECT TO edo_reader USING (true);
CREATE POLICY edo_read ON public.vafo_customers FOR SELECT TO edo_reader USING (true);
CREATE POLICY edo_read ON public.vafo_payments FOR SELECT TO edo_reader USING (true);
```
Tekshirish: `edo_reader` bilan boshqa jadval (masalan `crm_users`) o'qilmasligi, `delete from customers`
rad etilishi kerak.

## 2. EDO serveri tomonida
1. `/opt/edo/.env` ga qo'shing (kodga/Git'ga qo'shmang):
   `CRM_DATABASE_URL=postgresql://edo_reader:<PAROL>@supabase-db:5432/postgres`
2. `/opt/edo/docker-compose.yml` dagi `edo` xizmati `environment:` ga qo'shing:
   `CRM_DATABASE_URL: ${CRM_DATABASE_URL:-}`
3. `cd /opt/edo && docker compose -p edo up -d edo`

EDO `supabase_default` tarmog'iga ulangan, shuning uchun `supabase-db` nomi ishlaydi.
`CRM_DATABASE_URL` berilmasa, "CRM'dan tanlash" bo'limi ko'rinmaydi va xatlar avvalgidek
qo'lda to'ldiriladi.

## Xavfsizlik eslatmasi
CRM jadvallarida (`customers`, `payments`, `vafo_customers`) `USING (true)` qoidali RLS
siyosatlari bor (`TO` ko'rsatilmagan). Bu `anon` kalit bilan kirgan har kimga mijozlar
ismi va qarzini o'qish/o'zgartirish imkonini berishi mumkin. CRM dasturchisi buni tekshirib,
siyosatlarni `authenticated` rol bilan cheklashi tavsiya etiladi.
