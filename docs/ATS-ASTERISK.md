# ATS (Asterisk) + Uztelecom IP-trunk + EDO: yozib olish va qayta eshitish

> **Eslatma:** bu yo'riqnoma namunaviy sozlama. EDO tomoni (webhook, yozuvni qabul qilish va tinglatish) sinalgan,
> Asterisk/Uztelecom qismi esa haqiqiy uskunada sinalmagan: raqamlar, kodeklar va ichki raqamlarni o'zingizga moslang.

## Sxema

```
Mijoz ──► Uztelecom (SIP server 172.25.251.45) ──VLAN 240──► ATS (Asterisk, 172.25.37.34) ──► operatorlar (softfon/IP-telefon)
                                                              │  MixMonitor: suhbatni yozadi
                                                              └─► internet orqali EDO:  /api/telephony/webhook  (qo'ng'iroq haqida)
                                                                                        /api/telephony/recording (yozuv fayli)
```

ATS **ofisdagi (yoki Uztelecom VLAN'i keladigan) alohida serverda** turadi, internetdagi VPS'da emas:
`172.25.x.x` yopiq tarmoq. ATS serveri ham Uztelecom ulanishiga, ham internetga (EDO'ga yuborish uchun) chiqishi kerak.

## 1. Tarmoq (Ubuntu, netplan) — VLAN 240

`/etc/netplan/60-uztelecom.yaml` (interfeys nomini `ip a` bilan tekshiring):

```yaml
network:
  version: 2
  ethernets:
    ens4: {}                       # Uztelecom ulangan fizik interfeys
  vlans:
    vlan240:
      id: 240
      link: ens4
      addresses: [172.25.37.34/24]
      routes:
        - to: 172.25.0.0/16        # Uztelecom ko'rsatgan statik marshrut
          via: 172.25.37.1
```

`sudo netplan apply`, so'ng tekshiring: `ping 172.25.37.1` va `ping 172.25.251.45`. Standart marshrutni (default gateway) bu interfeysga **bermang**, u internet interfeysida qolsin.

## 2. IP-trunk (ro'yxatdan o'tmasdan) — `pjsip.conf`

```ini
[transport-uz]
type=transport
protocol=udp
bind=0.0.0.0:5060

[uztelecom]
type=endpoint
transport=transport-uz
context=from-uztelecom
disallow=all
allow=alaw
allow=ulaw
aors=uztelecom
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
dtmf_mode=rfc4733

[uztelecom]
type=aor
contact=sip:172.25.251.45:5060

[uztelecom]
type=identify
endpoint=uztelecom
match=172.25.251.45
```

`rtp.conf`: `rtpstart=10000`, `rtpend=20000`. Uztelecom'dan kodeklar (G.711 alaw/ulaw yoki G.729), raqam formati va chiquvchi prefiksni aniqlang; kerak bo'lsa `allow=` qatorlarini o'zgartiring.

## 3. Kiruvchi qo'ng'iroq: yozish + EDO'ga yuborish — `extensions.conf`

```ini
[from-uztelecom]
exten => _X.,1,NoOp(Kiruvchi ${CALLERID(num)} -> ${EXTEN})
 same => n,Set(DID=${EXTEN})
 same => n,Set(REC=${UNIQUEID}.wav)
 ; Suhbat boshlanganda yozish (b - faqat javob berilganda). Xabarni qo'shing: "Suhbat yozib olinadi"
 ; same => n,Playback(custom/yozib-olinadi)
 same => n,MixMonitor(/var/spool/asterisk/monitor/${REC},b)
 same => n,Dial(PJSIP/101&PJSIP/102,30,tT)     ; operatorlar ichki raqamlari (yoki Queue(...))
 same => n,Hangup()

; Qo'ng'iroq tugaganda (har qanday natija bilan) EDO'ga yuboriladi
exten => h,1,System(/usr/local/bin/edo-call.sh "${UNIQUEID}" "${CALLERID(num)}" "${DID}" "${DIALSTATUS}" "${CDR(billsec)}" "${CDR(start)}" "${REC}")
```

## 4. Skriptni o'rnatish

```bash
sudo cp docs/ats/edo-call.sh /usr/local/bin/edo-call.sh
sudo chmod +x /usr/local/bin/edo-call.sh
sudo nano /usr/local/bin/edo-call.sh        # TOKEN va URL ni kiriting
sudo apt install -y ffmpeg curl             # mp3 ga siqish uchun (ixtiyoriy, lekin tavsiya etiladi)
```

`TOKEN` — EDO: **Tashqi tizimlar → IP-telefoniya** kartasidagi webhook manzilidagi `token=` dan keyingi qiymat.
Skript avval qo'ng'iroq haqida (`/webhook`), so'ng yozuvni (`/recording`) yuboradi; muvaffaqiyatli yuborilgach, ATS'dagi fayl o'chiriladi.

## 5. Tekshirish

1. Tashqi raqamdan ATS raqamiga qo'ng'iroq qiling, javob bering va 10 soniya gaplashing.
2. EDO: **Call-markaz → Qo'ng'iroqlar** da qator paydo bo'lishi, **Tinglash** tugmasi ishlashi kerak. Yangi raqam bo'lsa, «Lidlar» da «Yangi lead» yaratiladi.
3. Chiqmasa: EDO kartasida «Oxirgi kelgan so'rov» (format), ATS'da `asterisk -rvvv` va `sudo bash -x /usr/local/bin/edo-call.sh ...` ni ko'ring.

## Muhim

- **Disk:** WAV ~1 MB/daqiqa, mp3 (32 kbps) ~0,25 MB/daqiqa. Kuniga 100 ta qo'ng'iroq × 3 daqiqa ≈ 75 MB/kun (mp3). EDO kartasida «Saqlash muddati»ni (30–365 kun) tanlang: muddati o'tgan fayllar o'chiriladi.
- **Qonuniy talab:** mijozni suhbat yozib olinishi haqida ogohlantiring (kutish xabari) va yozuvlarni faqat xizmat maqsadida ishlating. Tinglash huquqi EDO'da «Call-markaz» ruxsati bilan beriladi.
- **Xavfsizlik:** token maxfiy; u sizib chiqsa, EDO kartasida «Yangilash» tugmasi bilan almashtiring va skriptdagi qiymatni yangilang.
- **Format:** EDO mp3, wav, ogg/opus, m4a, aac, flac qabul qiladi (gsm/sln qabul qilinmaydi).
