import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CrmService, type CrmContract } from "../crm/crm.service";
import { SettingsService } from "../settings/settings.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TelephonyService } from "../telephony/telephony.service";
import { normalizePhone } from "../telephony/telephony-parser";
import { AuditAction } from "../common/enums";
import { CreateCallLogDto, CreateLeadDto, SetClientPhoneDto, UpdateLeadDto, type LeadStage } from "./dto/calls.dto";

import { DEFAULT_SLA, RESOLVED_STAGES, UZ_FIXED_HOLIDAYS, businessHoursBetween, isWorkingTime, leadSla, makeCalendar, type SlaConfig, type WorkCalendar } from "./lead-sla";

const SLA_KEY = "call_sla";
const DIAL_KEY = "call_dial";

/** Loyiha maydonlari (DTO'dan): berilmaganlari o'zgarmaydi; oldindan to'lov "yo'q" bo'lsa summa tozalanadi */
function projectFields(dto: { projectAsset?: string; projectAmount?: number | null; projectTermMonths?: number | null; projectHasDownPayment?: boolean | null; projectDownPayment?: number | null }) {
  const out: Record<string, unknown> = {};
  if (dto.projectAsset !== undefined) out.projectAsset = dto.projectAsset.trim() || null;
  if (dto.projectAmount !== undefined) out.projectAmount = dto.projectAmount;
  if (dto.projectTermMonths !== undefined) out.projectTermMonths = dto.projectTermMonths;
  if (dto.projectHasDownPayment !== undefined) out.projectHasDownPayment = dto.projectHasDownPayment;
  if (dto.projectDownPayment !== undefined) out.projectDownPayment = dto.projectDownPayment;
  if (dto.projectHasDownPayment === false || dto.projectHasDownPayment === null) out.projectDownPayment = null;
  return out;
}


type Actor = { id: string; role: string; organizationId: string };
type CrmKey = "wafa_leasing" | "vafo_moliya";

/** Mijoz bilan gaplashilgan natijalar (qo'ng'iroq "yetib bordi" deb hisoblanadi). */
const REACHED = ["ANSWERED", "PROMISE", "REFUSED", "CALLBACK"];

/** Toshkent bo'yicha bugungi kun boshi (UTC+5, yozgi vaqt yo'q). */
function startOfTodayTashkent(now = new Date()): Date {
  const shifted = new Date(now.getTime() + 5 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 5 * 3600_000);
}

@Injectable()
export class CallsService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmService,
    private settings: SettingsService,
    private auditLog: AuditLogService,
    private telephony: TelephonyService,
  ) {}

  /** Bo'lim ruxsati serverda ham tekshiriladi (interfeys yashirishi yetarli emas). */
  private async assertAccess(role: string, mode: "view" | "edit") {
    const access = await this.settings.myAccess(role);
    const a = access["calls"];
    if (!(mode === "view" ? a?.canView : a?.canEdit)) throw new ForbiddenException("Call-markaz bo'limiga ruxsat yo'q.");
  }

  /** EDO tashkiloti nomi -> CRM'dagi kompaniya kaliti. */
  private crmKey(orgName: string): CrmKey {
    return orgName.toUpperCase().includes("VAFO") ? "vafo_moliya" : "wafa_leasing";
  }

  /**
   * Call-markaz kompaniyalar bo'yicha bo'linmaydi: foydalanuvchi kira oladigan barcha tashkilotlar
   * (odatda rahbariyat uchun ikkalasi, oddiy xodim uchun bittasi) qarzdorlari bitta ro'yxatda.
   */
  private async scope(actor: Actor): Promise<{ orgIds: string[]; crm: CrmKey[] }> {
    const rows = await this.prisma.userOrganization.findMany({
      where: { userId: actor.id },
      include: { organization: { select: { id: true, name: true } } },
    });
    const orgs = rows.length ? rows.map((r) => r.organization) : await this.prisma.organization.findMany({ where: { id: actor.organizationId }, select: { id: true, name: true } });
    return { orgIds: orgs.map((o) => o.id), crm: [...new Set(orgs.map((o) => this.crmKey(o.name)))] };
  }

  /**
   * Qo'ng'iroq navbati: CRM'dagi muddati o'tgan shartnomalar + har bir mijoz bo'yicha oxirgi
   * qo'ng'iroq, va'da va qayta qo'ng'iroq. Tartib: qayta qo'ng'iroq vaqti kelganlar, buzilgan
   * va'dalar, hali qo'ng'iroq qilinmaganlar, qolganlar (kechikish kuni bo'yicha).
   */
  async queue(actor: Actor, params: { q?: string; filter?: string }) {
    await this.assertAccess(actor.role, "view");
    if (!this.crm.isEnabled()) return { enabled: false, items: [], counts: {} };

    const { orgIds, crm } = await this.scope(actor);
    const contracts = (
      await Promise.all(crm.map((organization) => this.crm.searchContracts({ q: params.q, organization, overdueOnly: true, limit: 500 })))
    ).flat();
    const logs = contracts.length
      ? await this.prisma.callLog.findMany({
          where: { organizationId: { in: orgIds }, clientId: { in: contracts.map((c) => c.clientId) } },
          orderBy: { createdAt: "desc" },
          include: { operator: { select: { fullName: true } }, organization: { select: { name: true } } },
        })
      : [];
    const keyOf = (l: (typeof logs)[number]) => `${l.crmOrg ?? this.crmKey(l.organization.name)}:${l.clientId}`;
    const byClient = new Map<string, typeof logs>();
    for (const l of logs) {
      const k = keyOf(l);
      if (!byClient.has(k)) byClient.set(k, []);
      byClient.get(k)!.push(l);
    }

    const now = new Date();
    const todayStart = startOfTodayTashkent(now);
    const items = contracts.map((c: CrmContract) => {
      const history = byClient.get(`${c.organization}:${c.clientId}`) ?? [];
      const last = history[0] ?? null;
      const lastPromise = history.find((h) => h.outcome === "PROMISE" && h.promiseDate) ?? null;
      // Va'da keyingi qo'ng'iroqdan keyin yangilanmagan bo'lsa faol hisoblanadi
      const promiseActive = !!lastPromise && lastPromise.promiseDate!.getTime() + 86_400_000 > now.getTime();
      const promiseBroken = !!lastPromise && !promiseActive;
      const callbackLog = last && last.outcome === "CALLBACK" && last.callbackAt ? last : null;
      const callbackDue = !!callbackLog && callbackLog.callbackAt!.getTime() <= now.getTime();
      const calledToday = !!last && last.createdAt >= todayStart;
      return {
        ...c,
        calls: history.length,
        calledToday,
        lastCall: last ? { outcome: last.outcome, at: last.createdAt, by: last.operator.fullName, note: last.note } : null,
        promise: lastPromise ? { date: lastPromise.promiseDate, amount: lastPromise.promiseAmount, active: promiseActive, broken: promiseBroken } : null,
        callbackAt: callbackLog?.callbackAt ?? null,
        callbackDue,
      };
    });

    // Bugun qo'ng'iroq qilinganlar va faol va'dasi borlar navbatdan tushadi, lekin qayta qo'ng'iroq vaqti kelganlar qoladi
    const isTodo = (i: (typeof items)[number]) => i.callbackDue || (!i.calledToday && !i.promise?.active);
    const counts = {
      all: items.length,
      todo: items.filter(isTodo).length,
      promise: items.filter((i) => i.promise?.active).length,
      broken: items.filter((i) => i.promise?.broken).length,
      callback: items.filter((i) => i.callbackAt).length,
      today: items.filter((i) => i.calledToday).length,
    };

    const f = params.filter ?? "todo";
    let list = items;
    if (f === "todo") list = items.filter(isTodo);
    else if (f === "promise") list = items.filter((i) => i.promise?.active);
    else if (f === "broken") list = items.filter((i) => i.promise?.broken);
    else if (f === "callback") list = items.filter((i) => i.callbackAt);
    else if (f === "today") list = items.filter((i) => i.calledToday);

    const rank = (i: (typeof items)[number]) => (i.callbackDue ? 0 : i.promise?.broken ? 1 : i.calls === 0 ? 2 : 3);
    list = [...list].sort((a, b) => rank(a) - rank(b) || (b.dpd ?? 0) - (a.dpd ?? 0));
    return { enabled: true, items: list, counts };
  }

  async history(actor: Actor, clientId: string, crmOrg?: string) {
    await this.assertAccess(actor.role, "view");
    const { orgIds } = await this.scope(actor);
    const rows = await this.prisma.callLog.findMany({
      where: { organizationId: { in: orgIds }, clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { operator: { select: { fullName: true } }, organization: { select: { name: true } } },
    });
    return crmOrg ? rows.filter((r) => (r.crmOrg ?? this.crmKey(r.organization.name)) === crmOrg) : rows;
  }

  async log(actor: Actor, dto: CreateCallLogDto) {
    await this.assertAccess(actor.role, "edit");
    if (dto.outcome === "PROMISE") {
      if (!dto.promiseDate) throw new BadRequestException("Va'da sanasini kiriting.");
    }
    if (dto.outcome === "CALLBACK" && !dto.callbackAt) throw new BadRequestException("Qayta qo'ng'iroq vaqtini kiriting.");

    const { crm } = await this.scope(actor);
    const crmOrg = dto.crmOrg ?? crm[0];
    if (!crm.includes(crmOrg)) throw new ForbiddenException("Bu kompaniya mijozlariga ruxsat yo'q.");
    const created = await this.prisma.callLog.create({
      data: {
        organizationId: actor.organizationId,
        operatorId: actor.id,
        clientId: dto.clientId,
        crmOrg,
        clientName: dto.clientName,
        contractNumber: dto.contractNumber || null,
        phone: dto.phone || null,
        outcome: dto.outcome,
        note: dto.note?.trim() || null,
        promiseDate: dto.outcome === "PROMISE" && dto.promiseDate ? new Date(dto.promiseDate) : null,
        promiseAmount: dto.outcome === "PROMISE" ? dto.promiseAmount ?? null : null,
        callbackAt: dto.outcome === "CALLBACK" && dto.callbackAt ? new Date(dto.callbackAt) : null,
        dpdAtCall: dto.dpd ?? null,
        overdueAtCall: dto.overdueAmount ?? null,
      },
    });
    await this.auditLog.record({ userId: actor.id, action: AuditAction.CREATE, metadata: { kind: "callLog", callId: created.id, outcome: dto.outcome } });
    return created;
  }

  /** Davr bo'yicha statistika (1 = bugun, 7, 30 kun). */
  async stats(actor: Actor, days: number) {
    await this.assertAccess(actor.role, "view");
    const d = Math.min(Math.max(Math.round(days) || 1, 1), 90);
    const from = new Date(startOfTodayTashkent().getTime() - (d - 1) * 86_400_000);
    const { orgIds } = await this.scope(actor);
    const logs = await this.prisma.callLog.findMany({
      where: { organizationId: { in: orgIds }, createdAt: { gte: from } },
      include: { operator: { select: { id: true, fullName: true } } },
    });
    const outcomes: Record<string, number> = {};
    const ops = new Map<string, { name: string; calls: number; reached: number; promises: number; promiseSum: number }>();
    let promiseSum = 0;
    for (const l of logs) {
      outcomes[l.outcome] = (outcomes[l.outcome] ?? 0) + 1;
      const o = ops.get(l.operatorId) ?? { name: l.operator.fullName, calls: 0, reached: 0, promises: 0, promiseSum: 0 };
      o.calls++;
      if (REACHED.includes(l.outcome)) o.reached++;
      if (l.outcome === "PROMISE") { o.promises++; o.promiseSum += l.promiseAmount ?? 0; promiseSum += l.promiseAmount ?? 0; }
      ops.set(l.operatorId, o);
    }
    const reached = logs.filter((l) => REACHED.includes(l.outcome)).length;
    return {
      days: d,
      total: logs.length,
      uniqueClients: new Set(logs.map((l) => `${l.crmOrg ?? ""}:${l.clientId}`)).size,
      reached,
      reachRate: logs.length ? Math.round((reached / logs.length) * 100) : 0,
      promises: outcomes["PROMISE"] ?? 0,
      promiseSum: Math.round(promiseSum),
      outcomes,
      operators: [...ops.values()].sort((a, b) => b.calls - a.calls),
    };
  }

  // ---------- Lidlar (yangi mijozlar Kanban'i) ----------

  private digits(phone?: string | null) { return (phone ?? "").replace(/\D/g, ""); }

  private async findLead(actor: Actor, id: string) {
    const { orgIds } = await this.scope(actor);
    const lead = await this.prisma.callLead.findFirst({ where: { id, organizationId: { in: orgIds } } });
    if (!lead) throw new NotFoundException("Lid topilmadi.");
    return lead;
  }

  /** Bosqichga mos sana majburiy: uchrashuv - meetingAt, qayta bog'lanish - callbackAt. */
  private checkStageDates(stage: LeadStage, meetingAt?: Date | null, callbackAt?: Date | null) {
    if (stage === "MEETING" && !meetingAt) throw new BadRequestException("Uchrashuv sanasi va vaqtini kiriting.");
    if (stage === "CALLBACK" && !callbackAt) throw new BadRequestException("Qayta bog'lanish sanasi va vaqtini kiriting.");
  }

  async leads(actor: Actor) {
    await this.assertAccess(actor.role, "view");
    const { orgIds } = await this.scope(actor);
    const rows = await this.prisma.callLead.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: {
        owner: { select: { id: true, fullName: true, position: true } },
        phoneCalls: { orderBy: { startedAt: "desc" }, take: 1, select: { direction: true, status: true, startedAt: true } },
      },
    });
    // Har bir lid uchun ish muddatlari (faqat ish vaqti, dam olish va bayram kunlarisiz)
    const { cfg, cal } = await this.slaCalendar();
    const now = new Date();
    return rows.map((l) => ({ ...l, sla: leadSla(l, cfg, cal, now) }));
  }

  // ---------- Ish vaqti, muddatlar va bayram kunlari ----------

  private slaCache: { at: number; cfg: SlaConfig; cal: WorkCalendar } | null = null;

  /** Ish vaqti sozlamasi va bayram kunlari (30 soniya keshlanadi). */
  private async slaCalendar() {
    if (this.slaCache && Date.now() - this.slaCache.at < 30_000) return this.slaCache;
    const [row, holidays] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: SLA_KEY } }),
      this.prisma.holiday.findMany({ select: { date: true, type: true } }),
    ]);
    let cfg: SlaConfig = { ...DEFAULT_SLA };
    try { if (row) cfg = { ...cfg, ...JSON.parse(row.value) }; } catch { /* standart */ }
    // Bir martalik o'tish: javob muddati avval 24 ish soati edi, endi 1 ish kuni (8 soat).
    // Administrator keyin o'zi o'zgartirgan qiymatga (respV2 belgisi bor) tegilmaydi.
    if (row && !(cfg as SlaConfig & { respV2?: boolean }).respV2 && cfg.responseHours === 24) {
      cfg = { ...cfg, responseHours: DEFAULT_SLA.responseHours };
      await this.prisma.appSetting.update({ where: { key: SLA_KEY }, data: { value: JSON.stringify({ ...cfg, respV2: true }) } }).catch(() => undefined);
    }
    this.slaCache = { at: Date.now(), cfg, cal: makeCalendar(cfg, holidays) };
    return this.slaCache;
  }

  async slaSettings(actor: Actor) {
    await this.assertAccess(actor.role, "view");
    const { cfg, cal } = await this.slaCalendar();
    const holidays = await this.prisma.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)) } }, orderBy: { date: "asc" } });
    return { ...cfg, workingNow: isWorkingTime(new Date(), cal), holidays };
  }

  private assertSettingsAdmin(actor: Actor) {
    if (actor.role !== "ADMIN") throw new ForbiddenException("Ish vaqti va bayram kunlarini faqat administrator o'zgartiradi.");
  }

  /** Qo'ng'iroq havolasidagi raqam formati: plus (+998...), intl (998...), local (90...) va ixtiyoriy prefiks. */
  async dialSettings(actor: Actor) {
    await this.assertAccess(actor.role, "view");
    const row = await this.prisma.appSetting.findUnique({ where: { key: DIAL_KEY } });
    let cfg = { format: "local", prefix: "" };
    try { if (row) cfg = { ...cfg, ...JSON.parse(row.value) }; } catch { /* standart */ }
    return cfg;
  }

  async saveDialSettings(actor: Actor, dto: { format?: string; prefix?: string }) {
    this.assertSettingsAdmin(actor);
    const next = { ...(await this.dialSettings(actor)), ...dto };
    await this.prisma.appSetting.upsert({ where: { key: DIAL_KEY }, create: { key: DIAL_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    return next;
  }

  async saveSlaSettings(actor: Actor, dto: Partial<SlaConfig>) {
    this.assertSettingsAdmin(actor);
    const { cfg } = await this.slaCalendar();
    const next = { ...cfg, ...dto, respV2: true };
    const m = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    if (!m(next.workStart) || !m(next.workEnd) || next.workEnd <= next.workStart) throw new BadRequestException("Ish vaqti noto'g'ri (masalan 09:00 - 18:00).");
    await this.prisma.appSetting.upsert({ where: { key: SLA_KEY }, create: { key: SLA_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
    this.slaCache = null;
    return next;
  }

  async addHoliday(actor: Actor, dto: { date: string; name: string; type?: string }) {
    this.assertSettingsAdmin(actor);
    const date = new Date(`${dto.date.slice(0, 10)}T00:00:00.000Z`);
    if (isNaN(+date)) throw new BadRequestException("Sana noto'g'ri.");
    const exists = await this.prisma.holiday.findUnique({ where: { date } });
    if (exists) throw new BadRequestException(`Bu sana allaqachon belgilangan: ${exists.name}.`);
    const h = await this.prisma.holiday.create({ data: { date, name: dto.name.trim(), type: dto.type === "WORKDAY" ? "WORKDAY" : "HOLIDAY" } });
    this.slaCache = null;
    return h;
  }

  async removeHoliday(actor: Actor, id: string) {
    this.assertSettingsAdmin(actor);
    await this.prisma.holiday.delete({ where: { id } }).catch(() => { throw new NotFoundException("Topilmadi."); });
    this.slaCache = null;
    return { deleted: true };
  }

  /** O'zbekistonning sanasi o'zgarmas bayramlarini tanlangan yil uchun qo'shadi (borlari o'tkazib yuboriladi). */
  async addDefaultHolidays(actor: Actor, year: number) {
    this.assertSettingsAdmin(actor);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new BadRequestException("Yil noto'g'ri.");
    const r = await this.prisma.holiday.createMany({
      data: UZ_FIXED_HOLIDAYS.map((h) => ({ date: new Date(`${year}-${h.md}T00:00:00.000Z`), name: h.name, type: "HOLIDAY" })),
      skipDuplicates: true,
    });
    this.slaCache = null;
    return { added: r.count };
  }

  /** Lid bosqichlari tarixi: qachon, qaysi bosqichdan qaysisiga va kim o'tkazgani. */
  async leadHistory(actor: Actor, id: string) {
    await this.assertAccess(actor.role, "view");
    await this.findLead(actor, id);
    const logs = await this.prisma.callLeadStageLog.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, fromStage: true, toStage: true, createdAt: true, user: { select: { fullName: true, position: true } } },
    });
    // Oldingi bosqichda qancha ish vaqti turgani
    const { cal } = await this.slaCalendar();
    return logs.map((l, i) => ({ ...l, spentHours: i ? businessHoursBetween(logs[i - 1].createdAt, l.createdAt, cal) : null }));
  }

  /** Call-markazda lid qo'shish va o'chirish faqat tizim administratoriga ruxsat etiladi. */
  private assertAdmin(actor: Actor, what: string) {
    if (actor.role !== "ADMIN") throw new ForbiddenException(`Lid ${what} faqat tizim administratori bajara oladi.`);
  }

  async createLead(actor: Actor, dto: CreateLeadDto) {
    await this.assertAccess(actor.role, "edit");
    this.assertAdmin(actor, "qo'shishni");
    const lossReasons = [...new Set(dto.lossReasons ?? [])];
    const lossNote = dto.lossNote?.trim() || null;
    // Rad etish sababi tanlangan yoki izohi yozilgan lid - "Sifatsiz lead"
    const stage: LeadStage = lossReasons.length || lossNote ? "UNQUALIFIED" : dto.stage ?? "NEW";
    const meetingAt = dto.meetingAt ? new Date(dto.meetingAt) : null;
    const callbackAt = dto.callbackAt ? new Date(dto.callbackAt) : null;
    this.checkStageDates(stage, meetingAt, callbackAt);

    const digits = this.digits(dto.phone);
    if (digits.length >= 7) {
      const { orgIds } = await this.scope(actor);
      const existing = await this.prisma.callLead.findMany({ where: { organizationId: { in: orgIds }, phone: { not: null } }, select: { name: true, phone: true } });
      const dup = existing.find((l) => this.digits(l.phone).slice(-9) === digits.slice(-9));
      if (dup) throw new BadRequestException(`Bu raqam bilan lid allaqachon bor: ${dup.name}.`);
    }

    const lead = await this.prisma.callLead.create({
      data: {
        organizationId: actor.organizationId,
        ownerId: actor.id,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        source: dto.source?.trim() || null,
        note: dto.note?.trim() || null,
        stage,
        meetingAt,
        callbackAt,
        lossReasons,
        lossTerm: lossReasons.includes("TERM") ? dto.lossTerm?.trim() || null : null,
        lossNote,
        ...projectFields(dto),
        respondedAt: stage !== "NEW" ? new Date() : null,
        resolvedAt: RESOLVED_STAGES.includes(stage) ? new Date() : null,
        stageLogs: { create: { toStage: stage, userId: actor.id } },
      },
      include: { owner: { select: { id: true, fullName: true, position: true } } },
    });
    await this.auditLog.record({ userId: actor.id, action: AuditAction.CREATE, metadata: { kind: "callLead", leadId: lead.id } });
    return lead;
  }

  async updateLead(actor: Actor, id: string, dto: UpdateLeadDto) {
    await this.assertAccess(actor.role, "edit");
    const lead = await this.findLead(actor, id);
    // Rad etish sabablari: kamida bittasi tanlansa lid avtomatik "Sifatsiz lead"ga o'tadi;
    // lid boshqa bosqichga qaytarilsa, eski sabablar tozalanadi
    let lossReasons = dto.lossReasons === undefined ? undefined : [...new Set(dto.lossReasons)];
    let lossNote = dto.lossNote === undefined ? undefined : dto.lossNote.trim() || null;
    const stage = (lossReasons?.length || lossNote ? "UNQUALIFIED" : dto.stage ?? lead.stage) as LeadStage;
    if (stage !== "UNQUALIFIED") {
      if (lossReasons?.length || lead.lossReasons.length) lossReasons = [];
      if (lossNote || lead.lossNote) lossNote = null;
    }
    const reasonsNow = lossReasons ?? lead.lossReasons;
    const lossTerm = !reasonsNow.includes("TERM") ? (lead.lossTerm || dto.lossTerm ? null : undefined) : dto.lossTerm === undefined ? undefined : dto.lossTerm.trim() || null;
    const meetingAt = dto.meetingAt !== undefined ? new Date(dto.meetingAt) : lead.meetingAt;
    const callbackAt = dto.callbackAt !== undefined ? new Date(dto.callbackAt) : lead.callbackAt;
    this.checkStageDates(stage, meetingAt, callbackAt);

    const changed = stage !== lead.stage;
    const now = new Date();
    return this.prisma.callLead.update({
      where: { id },
      data: {
        // Bosqich o'zgarishi vaqti va kim o'tkazgani tarixga yoziladi; birinchi javob va natija vaqtlari belgilanadi
        ...(changed ? {
          stageLogs: { create: { fromStage: lead.stage, toStage: stage, userId: actor.id } },
          respondedAt: lead.respondedAt ?? (lead.stage === "NEW" ? now : lead.stageChangedAt),
          resolvedAt: lead.resolvedAt ?? (RESOLVED_STAGES.includes(stage) ? now : undefined),
        } : {}),
        lossReasons,
        lossTerm,
        lossNote,
        ...projectFields(dto),
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        source: dto.source === undefined ? undefined : dto.source.trim() || null,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
        stage,
        stageChangedAt: changed ? now : undefined,
        meetingAt,
        callbackAt,
      },
      include: { owner: { select: { id: true, fullName: true, position: true } } },
    });
  }

  async removeLead(actor: Actor, id: string) {
    await this.assertAccess(actor.role, "edit");
    this.assertAdmin(actor, "o'chirishni");
    await this.findLead(actor, id);
    await this.prisma.callLead.delete({ where: { id } });
    await this.auditLog.record({ userId: actor.id, action: AuditAction.DELETE, metadata: { kind: "callLead", leadId: id } });
    return { deleted: true };
  }

  // ---------- Kalendar ----------

  /**
   * Kalendar voqealari: lidlarning uchrashuvi (MEETING bosqichi) va qayta bog'lanishi (CALLBACK bosqichi).
   */
  async calendar(actor: Actor, from: Date, to: Date) {
    await this.assertAccess(actor.role, "view");
    const { orgIds } = await this.scope(actor);
    type Ev = { id: string; type: string; at: Date; allDay: boolean; title: string; subtitle: string | null; phone: string | null; leadId?: string };
    const events: Ev[] = [];

    const leads = await this.prisma.callLead.findMany({
      where: {
        organizationId: { in: orgIds },
        OR: [
          { stage: "MEETING", meetingAt: { gte: from, lt: to } },
          { stage: "CALLBACK", callbackAt: { gte: from, lt: to } },
        ],
      },
      include: { owner: { select: { fullName: true } } },
    });
    for (const l of leads) {
      const meeting = l.stage === "MEETING";
      events.push({
        id: `lead-${l.id}`, type: meeting ? "MEETING" : "LEAD_CALLBACK", at: (meeting ? l.meetingAt : l.callbackAt)!, allDay: false,
        title: l.name, subtitle: l.owner?.fullName ?? "IP-telefoniya", phone: l.phone, leadId: l.id,
      });
    }

    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // ---------- IP-telefoniya qo'ng'iroqlari ----------

  /** ATS orqali kelgan/ketgan qo'ng'iroqlar ro'yxati (filtrlar: yo'nalish, holat, qidiruv, lid) + bugungi hisob. */
  async phoneCalls(actor: Actor, params: { direction?: string; status?: string; q?: string; leadId?: string; limit?: number }) {
    await this.assertAccess(actor.role, "view");
    const { orgIds } = await this.scope(actor);
    const where: any = { organizationId: { in: orgIds } };
    if (params.direction === "IN" || params.direction === "OUT") where.direction = params.direction;
    if (params.status && ["ANSWERED", "MISSED", "BUSY", "FAILED"].includes(params.status)) where.status = params.status;
    if (params.leadId) where.leadId = params.leadId;
    const q = params.q?.trim();
    if (q) {
      const digits = q.replace(/\D/g, "");
      where.OR = [
        ...(digits ? [{ phone: { contains: digits } }] : []),
        { lead: { name: { contains: q, mode: "insensitive" } } },
        { extension: { contains: q } },
      ];
    }
    const todayStart = startOfTodayTashkent();
    const [items, today, staff] = await Promise.all([
      this.prisma.phoneCall.findMany({
        where, orderBy: { startedAt: "desc" }, take: Math.min(Math.max(params.limit ?? 200, 1), 500),
        select: { id: true, direction: true, status: true, phone: true, ourNumber: true, extension: true, startedAt: true, durationSec: true, recordingUrl: true, recordingFile: true, lead: { select: { id: true, name: true } } },
      }),
      this.prisma.phoneCall.groupBy({ by: ["direction", "status"], where: { organizationId: { in: orgIds }, startedAt: { gte: todayStart } }, _count: true }),
      // Ichki raqami biriktirilgan xodimlar - qo'ng'iroqqa kim javob bergani shu orqali aniqlanadi
      this.prisma.user.findMany({ where: { extension: { not: null } }, select: { id: true, fullName: true, position: true, extension: true } }),
    ]);
    const byExt = new Map(staff.map((u) => [u.extension!, { id: u.id, fullName: u.fullName, position: u.position }]));
    const count = (f: (g: (typeof today)[number]) => boolean) => today.filter(f).reduce((s, g) => s + g._count, 0);
    return {
      items: items.map(({ recordingFile, ...c }) => ({ ...c, hasRecording: !!recordingFile, operator: c.extension ? byExt.get(c.extension) ?? null : null })),
      today: {
        in: count((g) => g.direction === "IN"),
        out: count((g) => g.direction === "OUT"),
        missed: count((g) => g.direction === "IN" && g.status !== "ANSWERED"),
      },
    };
  }

  /** Yozuvni tinglash/yuklab olish uchun qisqa muddatli havola (bo'lim ruxsati va tashkilot doirasi tekshiriladi). */
  async recordingLink(actor: Actor, id: string) {
    await this.assertAccess(actor.role, "view");
    const { orgIds } = await this.scope(actor);
    const call = await this.prisma.phoneCall.findFirst({ where: { id, organizationId: { in: orgIds } }, select: { recordingFile: true, recordingUrl: true } });
    if (!call) throw new NotFoundException("Qo'ng'iroq topilmadi.");
    if (call.recordingFile) return { url: this.telephony.signedRecordingPath(id), external: false };
    if (call.recordingUrl) return { url: call.recordingUrl, external: true };
    throw new NotFoundException("Bu qo'ng'iroq uchun yozuv yo'q.");
  }

  // ---------- CRM mijozlari (majburiyati bor shartnomalar) ----------

  /**
   * CRM'dagi majburiyati bor (asosiy qoldiq > 0) mijozlar: to'lov sanalari, qarz, telefon (CRM ro'yxatidan yoki qo'lda
   * qo'shilgan). Filtrlar: all | overdue | soon (7 kun ichida to'lov) | nophone.
   */
  async clients(actor: Actor, params: { q?: string; filter?: string; sort?: string }) {
    await this.assertAccess(actor.role, "view");
    if (!this.crm.isEnabled()) return { enabled: false, items: [], counts: {} };
    const { crm } = await this.scope(actor);
    const contracts = (await Promise.all(crm.map((organization) => this.crm.searchContracts({ q: params.q, organization, overdueOnly: false, limit: 3000 })))).flat();

    const manual = contracts.length
      ? await this.prisma.clientPhone.findMany({ where: { crmOrg: { in: crm }, clientId: { in: contracts.map((c) => c.clientId) } } })
      : [];
    const manualBy = new Map(manual.map((m) => [`${m.crmOrg}:${m.clientId}`, m.phone]));

    const todayMs = startOfTodayTashkent().getTime();
    const items = contracts.map((c: CrmContract) => {
      const manualPhone = manualBy.get(`${c.organization}:${c.clientId}`) ?? null;
      const daysToPayment = c.nextPaymentDate ? Math.round((new Date(c.nextPaymentDate).getTime() + 5 * 3600_000 - todayMs) / 86_400_000) : null;
      return {
        ...c,
        crmPhone: c.phone,
        manualPhone,
        // Qo'lda kiritilgan raqam CRM ro'yxatidagidan ustun (operator tuzatgan bo'ladi)
        phone: manualPhone ?? c.phone,
        phoneSource: manualPhone ? ("manual" as const) : c.phone ? ("crm" as const) : null,
        daysToPayment,
      };
    });

    const isOverdue = (i: (typeof items)[number]) => (i.overdueAmount ?? 0) > 0 || (i.dpd ?? 0) > 0;
    const isSoon = (i: (typeof items)[number]) => !isOverdue(i) && i.daysToPayment !== null && i.daysToPayment <= 7;
    const counts = { all: items.length, overdue: items.filter(isOverdue).length, soon: items.filter(isSoon).length, nophone: items.filter((i) => !i.phone).length };

    const f = params.filter ?? "all";
    let list = items;
    if (f === "overdue") list = items.filter(isOverdue);
    else if (f === "soon") list = items.filter(isSoon);
    else if (f === "nophone") list = items.filter((i) => !i.phone);

    const sort = params.sort ?? (f === "overdue" ? "dpd" : "payment");
    list = [...list].sort((a, b) =>
      sort === "name" ? a.clientName.localeCompare(b.clientName)
      : sort === "dpd" ? (b.dpd ?? 0) - (a.dpd ?? 0) || a.clientName.localeCompare(b.clientName)
      : (a.daysToPayment ?? 9999) - (b.daysToPayment ?? 9999) || a.clientName.localeCompare(b.clientName));
    return { enabled: true, items: list, counts };
  }

  /** Mijozga telefon raqamini qo'lda qo'shish/o'zgartirish (bo'sh raqam - qo'lda kiritilganini o'chiradi, CRM raqami qoladi). */
  async setClientPhone(actor: Actor, dto: SetClientPhoneDto) {
    await this.assertAccess(actor.role, "edit");
    const { crm } = await this.scope(actor);
    if (!crm.includes(dto.crmOrg)) throw new ForbiddenException("Bu kompaniya mijozlariga ruxsat yo'q.");
    const phone = dto.phone.trim();
    if (!phone) {
      await this.prisma.clientPhone.deleteMany({ where: { crmOrg: dto.crmOrg, clientId: dto.clientId } });
      return { phone: null };
    }
    if (phone.replace(/\D/g, "").length < 7) throw new BadRequestException("Telefon raqami noto'g'ri.");
    const normalized = normalizePhone(phone) ?? phone;
    await this.prisma.clientPhone.upsert({
      where: { crmOrg_clientId: { crmOrg: dto.crmOrg, clientId: dto.clientId } },
      create: { crmOrg: dto.crmOrg, clientId: dto.clientId, phone: normalized, updatedById: actor.id },
      update: { phone: normalized, updatedById: actor.id },
    });
    await this.auditLog.record({ userId: actor.id, action: AuditAction.UPDATE, metadata: { kind: "clientPhone", crmOrg: dto.crmOrg, clientId: dto.clientId } });
    return { phone: normalized };
  }
}
