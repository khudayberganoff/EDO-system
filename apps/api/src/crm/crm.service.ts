import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Pool } from "pg";
import { computeLedger, dayOf, isoOfDay, type Extra, type PlanMonth } from "./crm-ledger";
import { loadPhones, matchPhone } from "./crm-phones";

export interface CrmContract {
  organization: string;
  clientId: string;
  clientName: string;
  clientType: "CITIZEN" | "ORGANIZATION";
  phone: string | null;
  address: string | null;
  contractId: string;
  contractNumber: string | null;
  contractDate: string | null;
  endDate: string | null;
  product: string | null;
  principalBalance: number | null;
  profitBalance: number | null;
  overdueAmount: number | null;
  dpd: number | null;
  monthlyPayment: number | null;
  paymentDay: number | null;
}

const ORG_RE = /(mchj|мчж|xk|хк|xnnt|хн?нт|yatt|ятт|llc|ooo|ооо|universiteti|университет)/i;

/** Bugungi sana (Toshkent) - CRM brauzerda shu sana bilan hisoblaydi. */
function todayTashkent(): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).split("-").map(Number);
  return dayOf(y, m, d);
}

/** "№17 от 18.12.2025" -> raqam va sana (CRM ham sanani shu matndan oladi). */
function parseContractNum(raw: string | null): { number: string | null; date: string | null } {
  if (!raw) return { number: null, date: null };
  const dm = raw.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null;
  const nm = raw.match(/№\s*([^\s]+)/);
  return { number: (nm ? nm[1] : raw).trim() || null, date };
}

function clientType(mulkchilik: string | null, name: string): "CITIZEN" | "ORGANIZATION" {
  const m = (mulkchilik ?? "").trim();
  if (/^[ЮюYy]/.test(m)) return "ORGANIZATION";
  if (/^[ЖжJj]/.test(m)) return "CITIZEN";
  return ORG_RE.test(name) ? "ORGANIZATION" : "CITIZEN";
}

const TABLES = {
  wafa_leasing: { customers: "customers", payments: "payments", vafo: false },
  vafo_moliya: { customers: "vafo_customers", payments: "vafo_payments", vafo: true },
} as const;

/**
 * CRM bazasidan (Supabase) FAQAT O'QISH. `edo_reader` roli faqat customers, payments,
 * vafo_customers, vafo_payments jadvallariga SELECT huquqiga ega bo'lishi kerak
 * (bax. docs/CRM-INTEGRATION.md). Qarzdorlik CRM'dagi kabi (crm-ledger.ts) hisoblanadi.
 * Mijoz ma'lumoti EDO'da saqlanmaydi: har so'rovda o'qiladi.
 */
@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);
  private pool: Pool | null = null;

  isEnabled(): boolean {
    return !!process.env.CRM_DATABASE_URL;
  }

  private getPool(): Pool {
    if (!process.env.CRM_DATABASE_URL) {
      throw new ServiceUnavailableException("CRM bilan ulanish sozlanmagan.");
    }
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: process.env.CRM_DATABASE_URL,
        max: 3,
        connectionTimeoutMillis: 5000,
        statement_timeout: 8000,
        options: "-c default_transaction_read_only=on",
      });
      this.pool.on("error", (err) => this.logger.warn(`CRM ulanishida xato: ${err.message}`));
    }
    return this.pool;
  }

  async searchContracts(params: { q?: string; organization?: string; overdueOnly?: boolean; limit?: number }): Promise<CrmContract[]> {
    const org = params.organization === "vafo_moliya" ? "vafo_moliya" : "wafa_leasing";
    const t = TABLES[org];
    const q = params.q?.trim().toLowerCase() || null;
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const today = todayTashkent();
    const phones = loadPhones();
    const phoneOrg = org === "vafo_moliya" ? "vafo" : "wafa";

    let customers: any[];
    let payments: any[];
    try {
      const pool = this.getPool();
      [customers, payments] = (
        await Promise.all([
          pool.query(`SELECT id, name, mulkchilik, paydey, tury, contract_num, n, months FROM ${t.customers}`),
          pool.query(`SELECT customer_id, payment_date, amount FROM ${t.payments}`),
        ])
      ).map((r) => r.rows);
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`CRM so'rovi muvaffaqiyatsiz: ${err.message}`);
      throw new ServiceUnavailableException("CRM'dan ma'lumot olib bo'lmadi.");
    }

    const extraBy = new Map<string, Extra[]>();
    for (const p of payments) {
      const iso = p.payment_date instanceof Date ? p.payment_date.toISOString().slice(0, 10) : String(p.payment_date).slice(0, 10);
      const [y, m, d] = iso.split("-").map(Number);
      const key = String(p.customer_id);
      if (!extraBy.has(key)) extraBy.set(key, []);
      extraBy.get(key)!.push({ day: dayOf(y, m, d), amount: parseFloat(p.amount) || 0, year: y, month: m });
    }

    const out: CrmContract[] = [];
    for (const c of customers) {
      const months: PlanMonth[] = Array.isArray(c.months) ? c.months : [];
      const led = computeLedger({
        months,
        N: parseFloat(c.n) || 0,
        paydey: Number(c.paydey) || 20,
        extra: extraBy.get(String(c.id)) ?? [],
        vafo: t.vafo,
        today,
      });
      if (!(led.principalLeft > 1000)) continue; // CRM: faol shartnoma = asosiy qoldiq > 1000
      if (params.overdueOnly && !(led.overdue > 1000 || led.dpd >= 1)) continue;

      const name = String(c.name ?? "");
      const num = parseContractNum(c.contract_num ?? null);
      if (q && !name.toLowerCase().includes(q) && !String(c.contract_num ?? "").toLowerCase().includes(q)) continue;

      out.push({
        organization: org,
        clientId: String(c.id),
        clientName: name,
        clientType: clientType(c.mulkchilik ?? null, name),
        phone: (() => { const ph = matchPhone(phones, name, phoneOrg); return ph ? ph.p || ph.p2 || null : null; })(),
        address: null,
        contractId: String(c.id),
        contractNumber: num.number,
        contractDate: num.date,
        endDate: led.endDay === null ? null : isoOfDay(led.endDay),
        product: c.tury ?? null,
        principalBalance: Math.round(led.principalLeft),
        profitBalance: Math.round(led.profitLeft),
        overdueAmount: led.overdue > 1000 ? Math.round(led.overdue) : 0,
        dpd: led.dpd,
        monthlyPayment: Math.round(led.monthly),
        paymentDay: Number(c.paydey) || 20,
      });
    }
    out.sort((a, b) => (b.dpd ?? 0) - (a.dpd ?? 0) || a.clientName.localeCompare(b.clientName));
    return out.slice(0, limit);
  }
}
