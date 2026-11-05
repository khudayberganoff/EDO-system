import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CrmService, type CrmContract } from "../crm/crm.service";
import { SettingsService } from "../settings/settings.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TelephonyService } from "../telephony/telephony.service";
import { AuditAction } from "../common/enums";
import { CreateCallLogDto, CreateLeadDto, UpdateLeadDto, type LeadStage } from "./dto/calls.dto";

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
    return this.prisma.callLead.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: {
        owner: { select: { id: true, fullName: true } },
        phoneCalls: { orderBy: { startedAt: "desc" }, take: 1, select: { direction: true, status: true, startedAt: true } },
      },
    });
  }

  async createLead(actor: Actor, dto: CreateLeadDto) {
    await this.assertAccess(actor.role, "edit");
    const stage = dto.stage ?? "NEW";
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
      },
      include: { owner: { select: { id: true, fullName: true } } },
    });
    await this.auditLog.record({ userId: actor.id, action: AuditAction.CREATE, metadata: { kind: "callLead", leadId: lead.id } });
    return lead;
  }

  async updateLead(actor: Actor, id: string, dto: UpdateLeadDto) {
    await this.assertAccess(actor.role, "edit");
    const lead = await this.findLead(actor, id);
    const stage = (dto.stage ?? lead.stage) as LeadStage;
    const meetingAt = dto.meetingAt !== undefined ? new Date(dto.meetingAt) : lead.meetingAt;
    const callbackAt = dto.callbackAt !== undefined ? new Date(dto.callbackAt) : lead.callbackAt;
    this.checkStageDates(stage, meetingAt, callbackAt);

    return this.prisma.callLead.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        source: dto.source === undefined ? undefined : dto.source.trim() || null,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
        stage,
        stageChangedAt: dto.stage && dto.stage !== lead.stage ? new Date() : undefined,
        meetingAt,
        callbackAt,
      },
      include: { owner: { select: { id: true, fullName: true } } },
    });
  }

  async removeLead(actor: Actor, id: string) {
    await this.assertAccess(actor.role, "edit");
    const lead = await this.findLead(actor, id);
    if (lead.ownerId && lead.ownerId !== actor.id && !["ADMIN", "MANAGER"].includes(actor.role)) {
      throw new ForbiddenException("Lidni faqat uni qo'shgan xodim yoki rahbariyat o'chira oladi.");
    }
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
    const [items, today] = await Promise.all([
      this.prisma.phoneCall.findMany({
        where, orderBy: { startedAt: "desc" }, take: Math.min(Math.max(params.limit ?? 200, 1), 500),
        select: { id: true, direction: true, status: true, phone: true, ourNumber: true, extension: true, startedAt: true, durationSec: true, recordingUrl: true, recordingFile: true, lead: { select: { id: true, name: true } } },
      }),
      this.prisma.phoneCall.groupBy({ by: ["direction", "status"], where: { organizationId: { in: orgIds }, startedAt: { gte: todayStart } }, _count: true }),
    ]);
    const count = (f: (g: (typeof today)[number]) => boolean) => today.filter(f).reduce((s, g) => s + g._count, 0);
    return {
      items: items.map(({ recordingFile, ...c }) => ({ ...c, hasRecording: !!recordingFile })),
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
}
