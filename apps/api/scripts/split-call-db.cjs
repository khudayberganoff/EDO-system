#!/usr/bin/env node
/**
 * Call-markazni alohida tizimga ajratish: Call-markaz ma'lumotlarini EDO bazasidan YANGI (bo'sh) bazaga ko'chiradi.
 *
 * Call-markaz konteyneri ichida ishga tushiriladi (DATABASE_URL va JWT_SECRET - YANGI tizimniki):
 *
 *   SOURCE_DATABASE_URL=<EDO bazasi> SOURCE_JWT_SECRET=<EDO'ning JWT_SECRET'i> node apps/api/scripts/split-call-db.cjs
 *
 * Nima ko'chiriladi:
 *   - tashkilotlar; administratorlar, rahbariyat va operatorlar (parollari bilan - shu login/parol bilan kiradi);
 *     Call-markaz yozuvlarida uchraydigan boshqa xodimlar - nofaol holda (tarixdagi ismlar saqlanishi uchun)
 *   - lidlar, IP-telefoniya qo'ng'iroqlari, CRM qo'ng'iroq natijalari, qo'lda kiritilgan mijoz telefonlari
 *   - Facebook Lead Ads (ulanish, sahifalar, formalar, jurnal) va telefoniya / Telegram sozlamalari
 *   - "calls" va "settings" bo'limlari ruxsatlari
 * Shifrlangan qiymatlar (Facebook tokenlari, App Secret, Telegram tokeni) yangi JWT_SECRET bilan qayta shifrlanadi.
 * Qayta ishga tushirish xavfsiz: mavjud yozuvlar o'tkazib yuboriladi.
 *
 * EDO bazasidan Call-markaz ma'lumotlarini o'chirish (ko'chirish tekshirilgandan KEYIN, alohida):
 *   PURGE_SOURCE=yes SOURCE_DATABASE_URL=... node apps/api/scripts/split-call-db.cjs --purge-source
 */
const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");
const { PrismaClient, Prisma } = require("@prisma/client");

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.DATABASE_URL;
const SOURCE_SECRET = process.env.SOURCE_JWT_SECRET ?? process.env.JWT_SECRET;
const TARGET_SECRET = process.env.JWT_SECRET;

const die = (msg) => { console.error(`\nXATO: ${msg}\n`); process.exit(1); };

// ---------- shifrlash (common/secret-box.ts bilan bir xil algoritm) ----------
const keyOf = (secret, purpose) => crypto.createHash("sha256").update(`${secret ?? "edo"}:${purpose}`).digest();
function decrypt(stored, secret, purpose) {
  if (!stored) return null;
  try {
    const [v, iv, tag, data] = stored.split(":");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", keyOf(secret, purpose), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch { return null; }
}
function encrypt(plain, secret, purpose) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyOf(secret, purpose), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
let lostSecrets = 0;
/** Eski kalit bilan ochib, yangisi bilan qayta shifrlaydi. Ochilmasa - null (qayta kiritish/ulash kerak bo'ladi). */
function reencrypt(stored, purpose) {
  if (!stored) return stored;
  const plain = decrypt(stored, SOURCE_SECRET, purpose);
  if (plain === null) { lostSecrets++; return null; }
  return encrypt(plain, TARGET_SECRET, purpose);
}

/** createMany'da bo'sh (null) JSON maydon Prisma.DbNull bo'lishi kerak */
const jsonSafe = (rows, fields) => rows.map((r) => { const x = { ...r }; for (const f of fields) if (x[f] === null) x[f] = Prisma.DbNull; return x; });

async function copy(name, rows, insert) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await insert(rows.slice(i, i + 500));
    done += r?.count ?? 0;
  }
  console.log(`  ${name.padEnd(28)} ${String(rows.length).padStart(6)} ta (yangi qo'shildi: ${done})`);
}

async function migrate() {
  if (!SOURCE_URL) die("SOURCE_DATABASE_URL (EDO bazasi manzili) berilmagan.");
  if (!TARGET_URL) die("DATABASE_URL (yangi Call-markaz bazasi) berilmagan.");
  if (SOURCE_URL === TARGET_URL) die("SOURCE_DATABASE_URL va DATABASE_URL bir xil - yangi, alohida baza kerak.");
  if (!TARGET_SECRET) die("JWT_SECRET (yangi tizimniki) berilmagan.");

  console.log("1) Yangi bazada sxema yaratilmoqda (prisma db push)...");
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: path.resolve(__dirname, ".."), stdio: "inherit", env: { ...process.env, DATABASE_URL: TARGET_URL },
  });

  const src = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
  const dst = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
  try {
    console.log("2) Ma'lumotlar o'qilmoqda (EDO bazasi)...");
    const stageLogs = await src.callLeadStageLog.findMany().catch(() => []); // eski bazada jadval bo'lmasligi mumkin
    const [orgs, leads, calls, logs, phones, conns, pages, forms, events, perms, settings] = await Promise.all([
      src.organization.findMany(),
      src.callLead.findMany(),
      src.phoneCall.findMany(),
      src.callLog.findMany(),
      src.clientPhone.findMany(),
      src.metaConnection.findMany(),
      src.metaPage.findMany(),
      src.metaForm.findMany(),
      src.metaWebhookEvent.findMany(),
      src.modulePermission.findMany({ where: { module: { in: ["calls", "settings"] } } }),
      src.appSetting.findMany({ where: { key: { in: ["telephony", "telephony_last", "meta_app", "meta_last_webhook", "telegram_bot_token", "call_sla", "call_telegram_bot_token", "call_telegram_base", "call_dial"] } } }),
    ]);

    // Xodimlar: administrator, rahbariyat, operator - faol; Call-markaz yozuvlarida uchraydigan boshqalar - nofaol
    const referenced = new Set([
      ...leads.map((l) => l.ownerId), ...logs.map((l) => l.operatorId), ...phones.map((p) => p.updatedById),
      ...pages.map((p) => p.assigneeId), ...forms.map((f) => f.assigneeId),
    ].filter(Boolean));
    const CALL_ROLES = ["ADMIN", "MANAGER", "OPERATOR"];
    const users = (await src.user.findMany({ where: { OR: [{ role: { in: CALL_ROLES } }, { id: { in: [...referenced] } }] } }))
      .map((u) => (CALL_ROLES.includes(u.role) ? u : { ...u, isActive: false }));
    const userIds = new Set(users.map((u) => u.id));
    const userOrgs = await src.userOrganization.findMany({ where: { userId: { in: [...userIds] } } });

    console.log("3) Yangi bazaga yozilmoqda:");
    await copy("Tashkilotlar", orgs, (d) => dst.organization.createMany({ data: d, skipDuplicates: true }));
    await copy("Xodimlar", users, (d) => dst.user.createMany({ data: d, skipDuplicates: true }));
    await copy("Xodim-tashkilot", userOrgs, (d) => dst.userOrganization.createMany({ data: d, skipDuplicates: true }));
    await copy("Ruxsatlar (calls, settings)", perms, (d) => dst.modulePermission.createMany({ data: d, skipDuplicates: true }));
    await copy("Lidlar", leads, (d) => dst.callLead.createMany({ data: d, skipDuplicates: true }));
    await copy("Bayram kunlari", await src.holiday.findMany(), (d) => dst.holiday.createMany({ data: d, skipDuplicates: true }));
    await copy("Lid bosqichlari tarixi", stageLogs.map((s) => (s.userId && !userIds.has(s.userId) ? { ...s, userId: null } : s)), (d) => dst.callLeadStageLog.createMany({ data: d, skipDuplicates: true }));
    await copy("Qo'ng'iroqlar (ATS)", jsonSafe(calls, ["raw"]), (d) => dst.phoneCall.createMany({ data: d, skipDuplicates: true }));
    await copy("CRM qo'ng'iroq natijalari", logs, (d) => dst.callLog.createMany({ data: d, skipDuplicates: true }));
    await copy("Mijoz telefonlari (qo'lda)", phones, (d) => dst.clientPhone.createMany({ data: d, skipDuplicates: true }));

    const connsX = conns.map((c) => ({ ...c, userToken: reencrypt(c.userToken, "meta-token") ?? "", status: decrypt(c.userToken, SOURCE_SECRET, "meta-token") === null ? "REAUTH" : c.status }));
    const pagesX = pages.map((p) => ({ ...p, pageToken: reencrypt(p.pageToken, "meta-token") ?? "" }));
    await copy("Facebook ulanishi", connsX, (d) => dst.metaConnection.createMany({ data: d, skipDuplicates: true }));
    await copy("Facebook sahifalari", pagesX, (d) => dst.metaPage.createMany({ data: d, skipDuplicates: true }));
    await copy("Facebook formalari", jsonSafe(forms, ["questions", "mapping"]), (d) => dst.metaForm.createMany({ data: d, skipDuplicates: true }));
    await copy("Facebook jurnali", events, (d) => dst.metaWebhookEvent.createMany({ data: d, skipDuplicates: true }));

    const settingsX = settings.map((s) => {
      if (s.key === "telegram_bot_token") return { ...s, value: reencrypt(s.value, "telegram-token") };
      if (s.key === "call_telegram_bot_token") return { ...s, value: reencrypt(s.value, "call-telegram-token") };
      if (s.key === "meta_app") {
        try {
          const cfg = JSON.parse(s.value);
          if (cfg.appSecretEnc) cfg.appSecretEnc = reencrypt(cfg.appSecretEnc, "meta-app-secret") ?? undefined;
          return { ...s, value: JSON.stringify(cfg) };
        } catch { return s; }
      }
      return s;
    }).filter((s) => s.value);
    await copy("Sozlamalar (telefoniya, FB)", settingsX, (d) => dst.appSetting.createMany({ data: d, skipDuplicates: true }));

    console.log("\nTayyor. Call-markaz ma'lumotlari yangi bazaga ko'chirildi.");
    console.log(`  Faol xodimlar: ${users.filter((u) => u.isActive).length} (administrator / rahbariyat / operator), nofaol (tarix uchun): ${users.filter((u) => !u.isActive).length}`);
    if (lostSecrets) {
      console.log(`\n  DIQQAT: ${lostSecrets} ta shifrlangan qiymat ochilmadi (SOURCE_JWT_SECRET noto'g'ri yoki berilmagan).`);
      console.log("  Call-markazda Facebook'ni qayta ulash va App Secret / Telegram tokenini qayta kiritish kerak bo'ladi.");
    }
    console.log("\nKeyingi qadam: Call-markaz konteynerini ishga tushiring va call saytiga kirib tekshiring.");
    console.log("Hammasi joyida bo'lsa, EDO bazasidan Call-markaz ma'lumotlarini o'chirish mumkin (--purge-source).");
  } finally {
    await src.$disconnect();
    await dst.$disconnect();
  }
}

/** EDO bazasidan Call-markaz ma'lumotlarini o'chiradi va operatorlarni o'chiradi (nofaol qiladi). */
async function purgeSource() {
  if (!SOURCE_URL) die("SOURCE_DATABASE_URL (EDO bazasi manzili) berilmagan.");
  if (process.env.PURGE_SOURCE !== "yes") die("Tasdiqlash uchun PURGE_SOURCE=yes bering. Bu amal EDO bazasidan Call-markaz ma'lumotlarini o'chiradi.");
  const src = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
  try {
    const r = await src.$transaction([
      src.metaWebhookEvent.deleteMany({}),
      src.metaConnection.deleteMany({}), // sahifalar va formalar ham (cascade)
      src.phoneCall.deleteMany({}),
      src.callLead.deleteMany({}),
      src.callLog.deleteMany({}),
      src.clientPhone.deleteMany({}),
      src.appSetting.deleteMany({ where: { key: { in: ["telephony", "telephony_last", "meta_app", "meta_last_webhook"] } } }),
      src.user.updateMany({ where: { role: "OPERATOR" }, data: { isActive: false } }),
    ]);
    console.log("EDO bazasidan o'chirildi:", r.map((x) => x.count).join(" / "), "(jurnal / FB / qo'ng'iroqlar / lidlar / CRM natijalari / telefonlar / sozlamalar / nofaol qilingan operatorlar)");
  } finally {
    await src.$disconnect();
  }
}

(process.argv.includes("--purge-source") ? purgeSource() : migrate()).catch((e) => die(e?.message ?? String(e)));
