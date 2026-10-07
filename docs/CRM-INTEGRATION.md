# EDO <-> CRM: ogohlantirish xatlari uchun mijoz va qarzdorlik ma'lumoti

EDO "Ogohlantirish" xati shaklida **"CRM'dan tanlash"** bo'limi bor: kechikkan shartnoma
tanlansa, xatga mijoz nomi, telefon, shartnoma raqami/sanasi, oylik to'lov, to'lov kuni,
kechikkan kunlar va muddati o'tgan qarzdorlik avtomatik tushadi.

EDO CRM bazasiga (Supabase `supabase-db`) **faqat o'qish** huquqi bilan ulanadi va
**faqat `edo_portfolio` view'ini** o'qiydi. Mijoz ma'lumoti EDO'da saqlanmaydi: har safar
CRM'dan o'qiladi.

## 1. CRM tomonida (bir marta, `postgres` foydalanuvchisi bilan)

### 1.1. `edo_portfolio` view'i
Mazmuni CRM'ning **Monitoring -> Portfel** jadvali bilan bir xil bo'lishi kerak
(bir qator = bitta faol shartnoma, "Holat sanasi" = bugun). Ustunlar:

| Ustun | Tur | Izoh |
|---|---|---|
| `organization` | text | `wafa_leasing` yoki `vafo_moliya` |
| `client_id` | text | mijoz ID |
| `client_name` | text | Mijoz (FIO yoki kompaniya nomi) |
| `client_type` | text | `CITIZEN` (fuqaro) yoki `ORGANIZATION` (kompaniya) |
| `phone` | text | telefon (`+998...`) |
| `address` | text | manzil (bo'lsa, bo'sh bo'lishi mumkin) |
| `contract_id` | text | shartnoma ID |
| `contract_number` | text | shartnoma raqami (masalan `17`) |
| `contract_date` | date | shartnoma sanasi |
| `end_date` | date | tugash sanasi |
| `product` | text | mahsulot (Murobaha, Lizing, ...) |
| `principal_balance` | numeric | Asosiy qoldiq |
| `profit_balance` | numeric | Ustama qoldiq |
| `overdue_amount` | numeric | **Muddati o'tgan** summa (amaldagi qarzdorlik) |
| `dpd` | integer | Kechikkan kunlar (DPD) |
| `monthly_payment` | numeric | Oylik to'lov |
| `payment_day` | integer | To'lov kuni (har oy 20-kun -> `20`) |

Summalar **raqam** bo'lishi kerak (`509498670`, "509 498 670 so'm" emas).
`CREATE VIEW public.edo_portfolio AS SELECT ... FROM ...;` — qaysi jadval/hisob
`customers`, `payments`, `months` dan olinishini CRM'ning o'zi biladi.
`vafo_customers` (Vafo Moliya) ham shu view'ga `UNION ALL` bilan kiritilsin.

### 1.2. Faqat o'qiydigan rol
```sql
CREATE ROLE edo_reader LOGIN PASSWORD '<KUCHLI_PAROL>';
ALTER ROLE edo_reader SET default_transaction_read_only = on;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM edo_reader;
GRANT USAGE ON SCHEMA public TO edo_reader;
GRANT SELECT ON public.edo_portfolio TO edo_reader;
```
Tekshirish: `edo_reader` bilan `select * from customers` **rad etilishi**, `select * from edo_portfolio` ishlashi kerak.

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
CRM jadvallarida (`customers`, `payments`, `vafo_customers`) `USING (true)` qoidali
RLS siyosatlari bor (`TO` ko'rsatilmagan). Bu `anon` kalit bilan kirgan har kimga
mijozlar ismi, telefoni va qarzini o'qish/o'zgartirish imkonini berishi mumkin. CRM
dasturchisi buni tekshirib, siyosatlarni `authenticated` rol bilan cheklashi tavsiya etiladi.
