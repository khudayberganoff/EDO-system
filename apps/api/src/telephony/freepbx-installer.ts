import * as fs from "fs";
import * as path from "path";

/** Nest build `telephony/*.sh` ni dist'ga ko'chiradi (nest-cli.json assets) */
const SYNC_SCRIPT = path.join(__dirname, "freepbx-edo-sync.sh");

/**
 * FreePBX serveri uchun bitta buyruqli o'rnatuvchi: `curl -fsSL ".../freepbx-install.sh?token=..." | bash`.
 * Ichida Call-markaz manzili va token yozilgan sinxronlash skripti bor; o'rnatuvchi CDR bazasini tekshiradi,
 * (iloji bo'lsa) ffmpeg o'rnatadi, skriptni /usr/local/bin ga yozadi, har daqiqalik cron qo'shadi va bir marta ishga tushiradi.
 */
export function buildFreepbxInstaller(apiBase: string, token: string, prefix: string): string {
  const sync = fs.readFileSync(SYNC_SCRIPT, "utf8")
    .replace(/^URL=.*$/m, `URL="${apiBase}"`)
    .replace(/^TOKEN=.*$/m, `TOKEN="${token}"`)
    .replace(/^OUT_PREFIX=.*$/m, `OUT_PREFIX="${prefix}"`);
  return [
    "#!/bin/bash",
    "# WAFA Call-markaz <-> FreePBX ulanishi o'rnatuvchisi (Call-markaz tomonidan yaratilgan)",
    "set -e",
    'if [ "$(id -u)" != "0" ]; then echo "Xato: root sifatida ishga tushiring (avval: sudo -i)"; exit 1; fi',
    'echo "== WAFA Call-markaz: FreePBX ulanishi =="',
    "",
    'echo "[1/4] FreePBX qo\'ng\'iroqlar bazasi (CDR) tekshirilmoqda..."',
    'if ! mysql -N -B asteriskcdrdb -e "SELECT COUNT(*) FROM cdr" >/dev/null 2>&1; then',
    '  echo "Xato: asteriskcdrdb bazasini o\'qib bo\'lmadi. Bu FreePBX serverimi va root sifatida kirdingizmi?"; exit 1',
    "fi",
    "",
    'echo "[2/4] ffmpeg (yozuvlarni mp3 ga siqish uchun)..."',
    "if ! command -v ffmpeg >/dev/null 2>&1; then",
    "  (command -v apt-get >/dev/null 2>&1 && apt-get install -y -qq ffmpeg >/dev/null 2>&1) || (command -v yum >/dev/null 2>&1 && yum install -y -q ffmpeg >/dev/null 2>&1) || true",
    "fi",
    'command -v ffmpeg >/dev/null 2>&1 && echo "      ffmpeg bor" || echo "      ffmpeg o\'rnatilmadi - yozuvlar wav holida yuboriladi (ishlaydi, faqat kattaroq)"',
    "",
    'echo "[3/4] Skript va har daqiqalik ishga tushirish o\'rnatilmoqda..."',
    "cat > /usr/local/bin/freepbx-edo-sync.sh <<'EDO_SYNC_EOF'",
    sync.replace(/\n+$/, ""),
    "EDO_SYNC_EOF",
    "chmod 700 /usr/local/bin/freepbx-edo-sync.sh",
    "echo '* * * * * root /usr/local/bin/freepbx-edo-sync.sh >> /var/log/edo-sync.log 2>&1' > /etc/cron.d/edo-sync",
    "chmod 644 /etc/cron.d/edo-sync",
    "",
    'echo "[4/4] Birinchi marta ishga tushirilmoqda..."',
    "/usr/local/bin/freepbx-edo-sync.sh || true",
    'echo ""',
    'echo "Tayyor! Qo\'ng\'iroqlar har daqiqada Call-markazga yuboriladi (qo\'ng\'iroq tugagach ~1-2 daqiqada ko\'rinadi)."',
    'echo "Log: tail -f /var/log/edo-sync.log"',
    "",
  ].join("\n");
}
