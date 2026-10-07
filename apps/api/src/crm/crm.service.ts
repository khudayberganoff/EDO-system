import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Pool } from "pg";

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

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const toDate = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * CRM bazasidan (Supabase) FAQAT O'QISH. CRM tomonida `edo_portfolio` view'i va
 * faqat shu view'ga SELECT huquqi bor `edo_reader` roli yaratilgan bo'lishi kerak
 * (bax. docs/CRM-INTEGRATION.md). Mijoz ma'lumoti EDO'da saqlanmaydi: har so'rovda
 * CRM'dan o'qiladi va xat shakliga qo'yiladi.
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
    const q = params.q?.trim() || null;
    // LIKE belgilarini oddiy matn sifatida qidiramiz
    const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
    try {
      const { rows } = await this.getPool().query(
        `SELECT * FROM edo_portfolio
         WHERE ($1::text IS NULL OR organization = $1)
           AND ($2::text IS NULL OR client_name ILIKE $2 ESCAPE '\\' OR contract_number ILIKE $2 ESCAPE '\\')
           AND ($3::boolean IS NOT TRUE OR COALESCE(overdue_amount, 0) > 0 OR COALESCE(dpd, 0) > 0)
         ORDER BY dpd DESC NULLS LAST, client_name
         LIMIT $4`,
        [params.organization ?? null, pattern, params.overdueOnly ?? false, limit],
      );
      return rows.map((r) => this.map(r));
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`CRM so'rovi muvaffaqiyatsiz: ${err.message}`);
      throw new ServiceUnavailableException("CRM'dan ma'lumot olib bo'lmadi.");
    }
  }

  private map(r: any): CrmContract {
    return {
      organization: String(r.organization),
      clientId: String(r.client_id),
      clientName: String(r.client_name),
      clientType: r.client_type === "CITIZEN" ? "CITIZEN" : "ORGANIZATION",
      phone: r.phone ?? null,
      address: r.address ?? null,
      contractId: String(r.contract_id),
      contractNumber: r.contract_number ?? null,
      contractDate: toDate(r.contract_date),
      endDate: toDate(r.end_date),
      product: r.product ?? null,
      principalBalance: toNumber(r.principal_balance),
      profitBalance: toNumber(r.profit_balance),
      overdueAmount: toNumber(r.overdue_amount),
      dpd: r.dpd === null || r.dpd === undefined ? null : Math.trunc(Number(r.dpd)),
      monthlyPayment: toNumber(r.monthly_payment),
      paymentDay: r.payment_day === null || r.payment_day === undefined ? null : Math.trunc(Number(r.payment_day)),
    };
  }
}
