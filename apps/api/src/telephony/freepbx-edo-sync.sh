#!/bin/bash
# FreePBX -> WAFA Call-markaz: tugagan qo'ng'iroqlar (CDR) va suhbat yozuvlarini yuboradi.
#
# FreePBX dialplan'iga tegilmaydi: skript har daqiqada (cron) FreePBX'ning o'z CDR bazasidan
# (asteriskcdrdb.cdr) yangi qo'ng'iroqlarni o'qiydi, har bir qo'ng'iroqni (linkedid bo'yicha bitta) Call-markazga
# yuboradi va FreePBX yozgan yozuv faylini biriktiradi. FreePBX'dagi fayllar o'chirilmaydi.
#
# O'rnatish: Call-markaz -> Sozlamalar -> Integratsiyalar -> IP-telefoniya -> "FreePBX: bitta buyruq bilan ulash"
# (Call-markaz bu faylni URL va TOKEN to'ldirilgan holda beradi). Batafsil: docs/ATS-FREEPBX.md
set -u

# ---------------- Sozlamalar ----------------
URL="https://call.wafagroup.uz/api/telephony"   # Call-markaz manzili
TOKEN="BU_YERGA_TOKEN"                            # Call-markaz: Sozlamalar -> Integratsiyalar -> IP-telefoniya, webhook manzilidagi token=
OUT_PREFIX=""                                     # Chiquvchi raqam oldidagi chiqish prefiksi bo'lsa (masalan 9), shu yerga yozing
MONITOR_DIR="/var/spool/asterisk/monitor"         # FreePBX yozuvlari papkasi
STATE_DIR="/var/lib/edo-sync"                     # Qaysi qo'ng'iroqlar yuborilganini eslab qolish
MYSQL="${MYSQL:-mysql}"                           # root sifatida ishlaydi (FreePBX'da root parolsiz kiradi)
# ---------------------------------------------

mkdir -p "$STATE_DIR"
SENT="$STATE_DIR/sent.txt"
LAST="$STATE_DIR/last_calldate"
touch "$SENT"
[ -s "$LAST" ] || date -d "-10 minutes" "+%Y-%m-%d %H:%M:%S" > "$LAST"

# Bir vaqtda ikki nusxa ishlamasin
exec 9>"$STATE_DIR/lock"
flock -n 9 || exit 0

log() { echo "$(date '+%F %T') $*"; }
clean() { printf '%s' "$1" | tr -d '"\\\r\n\t'; }
digits() { printf '%s' "$1" | tr -cd '0-9'; }

since=$(cat "$LAST")

# Bitta qo'ng'iroq = bitta linkedid (navbat/guruh bo'lsa har bir jiringlagan operator alohida qator bo'ladi).
# Faqat tugaganiga kamida 1 daqiqa bo'lgan qo'ng'iroqlar olinadi (yozuv fayli to'liq yozilib bo'lsin).
rows=$($MYSQL -N -B asteriskcdrdb -e "
SELECT linkedid,
  DATE_FORMAT(MIN(calldate), '%Y-%m-%d %H:%i:%s'),
  SUBSTRING_INDEX(GROUP_CONCAT(src ORDER BY calldate, sequence SEPARATOR '|'), '|', 1),
  SUBSTRING_INDEX(GROUP_CONCAT(dst ORDER BY calldate, sequence SEPARATOR '|'), '|', 1),
  IFNULL(MAX(NULLIF(did, '')), ''),
  IF(SUM(disposition = 'ANSWERED') > 0, 'ANSWERED', SUBSTRING_INDEX(GROUP_CONCAT(disposition ORDER BY calldate SEPARATOR '|'), '|', 1)),
  MAX(billsec),
  IFNULL(MAX(NULLIF(recordingfile, '')), ''),
  IFNULL(SUBSTRING_INDEX(GROUP_CONCAT(IF(disposition = 'ANSWERED', dstchannel, NULL) ORDER BY calldate SEPARATOR '|'), '|', 1), ''),
  SUBSTRING_INDEX(GROUP_CONCAT(channel ORDER BY calldate, sequence SEPARATOR '|'), '|', 1)
FROM cdr
WHERE calldate >= DATE_SUB('$since', INTERVAL 2 HOUR)
GROUP BY linkedid
HAVING MIN(calldate) >= '$since'
   AND MAX(DATE_ADD(calldate, INTERVAL duration SECOND)) < DATE_SUB(NOW(), INTERVAL 1 MINUTE)
ORDER BY MIN(calldate)
LIMIT 200;") || { log "MySQL xatosi"; exit 1; }

[ -z "$rows" ] && exit 0

newest="$since"
# Bo'sh ustunlar siljib ketmasligi uchun tab o'rniga bo'shliq bo'lmagan ajratgich (\037) ishlatiladi
while IFS=$'\037' read -r id calldate src dst did disp billsec recfile anschan firstchan; do
  [ -z "$id" ] && continue
  newest="$calldate"
  grep -qxF "$id" "$SENT" && continue

  src_d=$(digits "$src"); dst_d=$(digits "$dst")
  # Ichki raqam (operator) - 2..5 xonali; tashqi raqam - 7 va undan ko'p
  if [ ${#src_d} -ge 2 ] && [ ${#src_d} -le 5 ] && [ ${#dst_d} -ge 7 ]; then
    direction="out"; ext="$src_d"; caller="$src_d"; callee="$dst_d"
    [ -n "$OUT_PREFIX" ] && [ "${callee#"$OUT_PREFIX"}" != "$callee" ] && [ ${#callee} -gt 9 ] && callee="${callee#"$OUT_PREFIX"}"
  else
    direction="in"; caller="$src_d"; callee="${did:-$dst}"
    # Javob bergan operator: "PJSIP/101-0000002a" -> 101
    ext=$(printf '%s' "$anschan" | sed -n 's#^[A-Za-z]*/\([0-9]\{2,5\}\)-.*#\1#p')
  fi
  # Ichki qo'ng'iroqlar (operatordan operatorga) va raqamsizlari yuborilmaydi
  if [ "$direction" = "in" ] && [ ${#caller} -lt 7 ]; then echo "$id" >> "$SENT"; continue; fi

  json=$(printf '{"uniqueid":"%s","direction":"%s","caller":"%s","callee":"%s","disposition":"%s","billsec":"%s","calldate":"%s","extension":"%s"}' \
    "$(clean "$id")" "$direction" "$(clean "$caller")" "$(clean "$callee")" "$(clean "$disp")" "$(digits "$billsec")" "$(date -d "$calldate" "+%Y-%m-%dT%H:%M:%S%:z")" "$(clean "$ext")")
  code=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X POST "$URL/webhook?token=$TOKEN" -H "content-type: application/json" -d "$json" < /dev/null)
  if [ "$code" = "400" ]; then
    log "Rad etildi (400, ma'lumot noto'g'ri): $id $direction $caller -> $callee"
    echo "$id" >> "$SENT"; continue
  elif [ "$code" != "200" ]; then
    # Tarmoq xatosi, server ishlamayapti yoki token noto'g'ri (403): keyingi daqiqada shu qo'ng'iroqdan qayta urinadi
    log "Yuborilmadi ($code): $id $direction $caller -> $callee"
    newest=$(date -d "$calldate 1 second ago" "+%Y-%m-%d %H:%M:%S")
    break
  fi
  log "Yuborildi: $id $direction $caller -> $callee $disp ${billsec}s ext=$ext"

  # Yozuv: FreePBX uni YYYY/MM/DD papkasiga saqlaydi
  if [ -n "$recfile" ]; then
    day=$(date -d "$calldate" "+%Y/%m/%d")
    rec="$MONITOR_DIR/$day/$recfile"
    [ -f "$rec" ] || rec=$(find "$MONITOR_DIR" -name "$(basename "$recfile")" -mtime -2 2>/dev/null | head -1)
    if [ -n "$rec" ] && [ -s "$rec" ]; then
      up="$rec"; tmp=""
      # mp3 ga siqish (~10 baravar kichik); ffmpeg bo'lmasa asl fayl yuboriladi
      if command -v ffmpeg >/dev/null 2>&1; then
        tmp="/tmp/edo-$(digits "$id").mp3"
        ffmpeg -nostdin -y -loglevel error -i "$rec" -ac 1 -b:a 32k "$tmp" < /dev/null && up="$tmp"
      fi
      rc=$(curl -s -m 180 -o /dev/null -w "%{http_code}" -F "file=@$up" "$URL/recording?token=$TOKEN&id=$(clean "$id")" < /dev/null)
      [ "$rc" = "200" ] && log "  yozuv biriktirildi: $(basename "$rec")" || log "  yozuv yuborilmadi ($rc): $rec"
      [ -n "$tmp" ] && rm -f "$tmp"
    fi
  fi
  echo "$id" >> "$SENT"
done < <(printf '%s\n' "$rows" | tr '\t' '\037')

echo "$newest" > "$LAST"
# Eslab qolingan ro'yxat cheksiz o'smasin
tail -n 5000 "$SENT" > "$SENT.tmp" && mv "$SENT.tmp" "$SENT"
