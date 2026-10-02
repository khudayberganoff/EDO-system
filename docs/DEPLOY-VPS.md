# EDO'ni o'z serveriga (Ubuntu 22.04) o'tkazish

Docker KERAK EMAS: LibreOffice (PDF uchun) serverga to'g'ridan-to'g'ri o'rnatiladi.
Barcha buyruqlar serverda bajariladi. `edo.example.uz` o'rniga o'z domeningizni yozing.

## 0. Oldindan
- Domen (masalan `edo.wafaleasing.uz`) DNS'da `A` yozuvi bilan server IP'siga yo'naltirilgan bo'lsin.
- Eski parollar almashtirilgan bo'lsin (console va root).

## 1. Xavfsizlik (root sifatida, birinchi marta)
```bash
apt update && apt -y upgrade
adduser edo                      # parol qo'ying, qolgan savollarga Enter
usermod -aG sudo edo
mkdir -p /home/edo/.ssh && cp ~/.ssh/authorized_keys /home/edo/.ssh/ 2>/dev/null || true
chown -R edo:edo /home/edo/.ssh && chmod 700 /home/edo/.ssh
```
O'z kompyuteringizdan SSH-kalit qo'shing (`ssh-copy-id edo@SERVER_IP`), keyin `edo` bilan kirishni tekshiring.
Tekshirgandan SO'NG root va parol bilan kirishni o'chiring: `/etc/ssh/sshd_config` da
`PermitRootLogin no` va `PasswordAuthentication no`, so'ng `systemctl restart ssh`.

Fayrvol:
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 2. Dasturlar
```bash
sudo apt -y install nginx postgresql git curl ca-certificates \
  libreoffice-writer fonts-liberation fonts-dejavu-core fonts-noto-core openssl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm i -g pm2
```

## 3. Baza
```bash
sudo -u postgres psql <<'SQL'
CREATE USER edo WITH PASSWORD 'KUCHLI_PAROL_YOZING';
CREATE DATABASE edo OWNER edo;
SQL
```
Postgres faqat serverning o'zidan ochiq (standart holat), tashqaridan ochmang.

## 4. Kod
```bash
sudo mkdir -p /opt/edo && sudo chown edo:edo /opt/edo
git clone https://github.com/khudayberganoff/EDO-system.git /opt/edo
cd /opt/edo
```
Muhit o'zgaruvchilari (`/opt/edo/apps/api/.env`, uni GitHub'ga QO'SHMANG):
```env
DATABASE_URL="postgresql://edo:KUCHLI_PAROL_YOZING@localhost:5432/edo"
JWT_SECRET="openssl rand -hex 32 natijasini yozing"
JWT_EXPIRES_IN=8h
PORT=10000
CORS_ORIGIN=https://edo.example.uz
PUBLIC_APP_URL=https://edo.example.uz
# ixtiyoriy: OPENAI_API_KEY=...  OPENAI_MODEL=...
```
`chmod 600 apps/api/.env`. `PUBLIC_APP_URL` QR-kodlar ko'rsatadigan manzil, to'g'ri yozing.

```bash
npm install
npm run build
cd apps/api && npx prisma db push --skip-generate && cd ../..
```
(Birinchi ishga tushishda admin/manager/employee hisoblari va ikki tashkilot avtomatik yaratiladi.
Kirgach `admin@wafagroup.uz` parolini darhol almashtiring.)

## 5. Doimiy ishga tushirish
```bash
cd /opt/edo
pm2 start "npm run start" --name edo --cwd /opt/edo
pm2 save && pm2 startup     # chiqqan buyruqni sudo bilan bajaring
```
Tekshirish: `curl -I http://localhost:10000/api/docs`

Yuklangan fayllar `apps/api/uploads` papkasida saqlanadi: uni bekapga qo'shing.

## 6. Nginx va HTTPS
`/etc/nginx/sites-available/edo`:
```nginx
server {
    listen 80;
    server_name edo.example.uz;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:10000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;   # PDF yaratish uchun
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/edo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d edo.example.uz --redirect
```

## 7. Yangilash (har safar kod yangilanganda)
```bash
cd /opt/edo && git pull && npm install && npm run build \
  && (cd apps/api && npx prisma db push --skip-generate) && pm2 restart edo
```

## 8. Bekap (har kuni)
`crontab -e` (edo foydalanuvchisi), `~/backups` papkasini oldindan yarating:
```cron
0 2 * * * pg_dump "postgresql://edo:KUCHLI_PAROL_YOZING@localhost:5432/edo" | gzip > ~/backups/edo-$(date +\%F).sql.gz && find ~/backups -mtime +14 -delete
30 2 * * * tar czf ~/backups/uploads-$(date +\%F).tgz -C /opt/edo/apps/api uploads
```
Bekapni vaqti-vaqti bilan BOSHQA joyga ham ko'chiring (server buzilsa, yo'qolmasligi uchun).

## 9. CRM uchun
Server IP'si doimiy, shuning uchun CRM tomonida EDO IP'sini ruxsat etilganlar ro'yxatiga qo'shish mumkin.

## Muammo bo'lsa
```bash
pm2 logs edo --lines 100        # ilova xatolari
sudo tail -50 /var/log/nginx/error.log
soffice --version               # LibreOffice o'rnatilganini tekshirish
```
