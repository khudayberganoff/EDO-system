#!/bin/bash
# EDO'ga qo'ng'iroq haqida ma'lumot va (bo'lsa) yozuv faylini yuboradi.
# Asterisk `h` extension'idan chaqiriladi (docs/ATS-ASTERISK.md). Hangup'ni kechiktirmaslik uchun orqa fonda ishlaydi.
#
# Argumentlar: 1=uniqueid 2=qo'ng'iroq qilgan raqam 3=terilgan (DID) 4=DIALSTATUS 5=billsec 6=boshlanish vaqti 7=yozuv fayli nomi
URL="https://edo.wafagroup.uz/api/telephony"
TOKEN="BU_YERGA_EDO_TOKENI"          # EDO -> Tashqi tizimlar -> IP-telefoniya kartasidagi token
MONITOR_DIR="/var/spool/asterisk/monitor"

(
  # 1) Qo'ng'iroq haqida ma'lumot (kiruvchi)
  curl -s -m 20 -G "$URL/webhook" \
    --data-urlencode "token=$TOKEN" --data-urlencode "direction=in" \
    --data-urlencode "uniqueid=$1" --data-urlencode "src=$2" --data-urlencode "dst=$3" \
    --data-urlencode "disposition=$4" --data-urlencode "billsec=${5:-0}" --data-urlencode "calldate=$6" >/dev/null

  # 2) Yozuv (faqat suhbat bo'lgan bo'lsa fayl bo'ladi): ffmpeg/lame bo'lsa mp3 ga siqiladi (~10 baravar kichik)
  REC="$MONITOR_DIR/$7"
  if [ -n "$7" ] && [ -s "$REC" ]; then
    UP="$REC"
    if command -v ffmpeg >/dev/null 2>&1; then
      ffmpeg -y -loglevel error -i "$REC" -ac 1 -b:a 32k "${REC%.*}.mp3" && UP="${REC%.*}.mp3"
    fi
    for i in 1 2 3; do
      code=$(curl -s -m 180 -o /dev/null -w "%{http_code}" -F "file=@$UP" "$URL/recording?token=$TOKEN&id=$1")
      [ "$code" = "200" ] && { rm -f "$REC" "$UP"; break; }
      sleep 10
    done
  fi
) >/dev/null 2>&1 &
