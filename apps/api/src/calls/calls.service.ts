import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CrmService, type CrmContract } from "../crm/crm.service";
import { SettingsService } from "../settings/settings.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AuditAction } from "../common/enums";
import { CreateCallLogDto } from "./dto/calls.dto";

type Actor = { id: string; role: string; organizationId: string };

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
  ) {}

  /** Bo'lim ruxsati serverda ham tekshiriladi (interfeys yashirishi yetarli emas). */
  private async assertAccess(role: string, mode: "view" | "edit") {
    const access = await this.settings.myAccess(role);
    const a = access["calls"];
    if (!(mode === "view" ? a?.canView : a?.canEdit)) throw new ForbiddenException("Call-markaz bo'limiga ruxsat yo'q.");
  }

  private async crmOrgKey(organizationId: string): Promise<"vafo_moliya" | "wafa_leasing"> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    return org?.name.toUpperCase().includes("VAFO") ? "vafo_moliya" : "wafa_leasing";
  }

  /**
   * Qo'ng'iroq navbati: CRM'dagi muddati o'tgan shartnomalar + har bir mijoz bo'yicha oxirgi
   * qo'ng'iroq, va'da va qayta qo'ng'iroq. Tartib: qayta qo'ng'iroq vaqti kelganlar, buzilgan
   * va'dalar, hali qo'ng'iroq qilinmaganlar, qolganlar (kechikish kuni bo'yicha).
   */
  async queue(actor: Actor, params: { q?: string; filter?: string }) {
    await this.assertAccess(actor.role, "view");
    if (!this.crm.isEnabled()) return { enabled: false, items: [], counts: {} };

    const contracts = await this.crm.searchContracts({
      q: params.q,
      organization: await this.crmOrgKey(actor.organizationId),
      overdueOnly: true,
      limit: 500,
    });
    const logs = contracts.length
      ? await this.prisma.callLog.findMany({
          where: { organizationId: actor.organizationId, clientId: { in: contracts.map((c) => c.clientId) } },
          orderBy: { createdAt: "desc" },
          include: { operator: { select: { fullName: true } } },
        })
      : [];
    const byClient = new Map<string, typeof logs>();
    for (const l of logs) {
      if (!byClient.has(l.clientId)) byClient.set(l.clientId, []);
      byClient.get(l.clientId)!.push(l);
    }

    const now = new Date();
    const todayStart = startOfTodayTashkent(now);
    const items = contracts.map((c: CrmContract) => {
      const history = byClient.get(c.clientId) ?? [];
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

  async history(actor: Actor, clientId: string) {
    await this.assertAccess(actor.role, "view");
    return this.prisma.callLog.findMany({
      where: { organizationId: actor.organizationId, clientId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { operator: { select: { fullName: true } } },
    });
  }

  async log(actor: Actor, dto: CreateCallLogDto) {
    await this.assertAccess(actor.role, "edit");
    if (dto.outcome === "PROMISE") {
      if (!dto.promiseDate) throw new BadRequestException("Va'da sanasini kiriting.");
    }
    if (dto.outcome === "CALLBACK" && !dto.callbackAt) throw new BadRequestException("Qayta qo'ng'iroq vaqtini kiriting.");

    const created = await this.prisma.callLog.create({
      data: {
        organizationId: actor.organizationId,
        operatorId: actor.id,
        clientId: dto.clientId,
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
    const logs = await this.prisma.callLog.findMany({
      where: { organizationId: actor.organizationId, createdAt: { gte: from } },
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
      uniqueClients: new Set(logs.map((l) => l.clientId)).size,
      reached,
      reachRate: logs.length ? Math.round((reached / logs.length) * 100) : 0,
      promises: outcomes["PROMISE"] ?? 0,
      promiseSum: Math.round(promiseSum),
      outcomes,
      operators: [...ops.values()].sort((a, b) => b.calls - a.calls),
    };
  }
}
