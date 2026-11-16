import * as crypto from "crypto";

/**
 * Meta Graph API bilan ishlash uchun yupqa qatlam (tashqi kutubxonasiz, fetch orqali).
 * Versiya `META_GRAPH_VERSION` bilan almashtiriladi; sinov uchun manzillar `META_GRAPH_BASE` / `META_DIALOG_BASE`.
 * Tokenlar URL'da bo'ladi, shuning uchun so'rov manzili hech qachon logga yozilmaydi.
 */
export const graphVersion = () => (process.env.META_GRAPH_VERSION || "v26.0").trim();
export const graphBase = () => (process.env.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/+$/, "");
export const dialogBase = () => (process.env.META_DIALOG_BASE || "https://www.facebook.com").replace(/\/+$/, "");

/** Kerakli ruxsatlar (Meta panelida solishtirib, `META_SCOPES` bilan o'zgartirish mumkin). */
export const DEFAULT_SCOPES = [
  "leads_retrieval",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_manage_ads",
  "ads_read",
  "business_management",
];

export class GraphError extends Error {
  constructor(message: string, readonly status: number, readonly code?: number, readonly subcode?: number) {
    super(message);
  }
  /** Token bekor qilingan / muddati o'tgan - qayta ulash kerak */
  get isAuthError() { return this.code === 190; }
  /** Ruxsat yetishmaydi (masalan ads_read yo'q) yoki maydon mavjud emas */
  get isPermissionOrField() {
    const c = this.code ?? 0;
    return c === 10 || c === 100 || (c >= 200 && c < 300);
  }
}

const proof = (token: string, appSecret: string) => crypto.createHmac("sha256", appSecret).update(token).digest("hex");

async function send(method: string, url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method, signal: AbortSignal.timeout(15_000) });
  } catch (e: any) {
    throw new GraphError(`Meta bilan aloqa yo'q: ${e?.name === "TimeoutError" ? "javob kelmadi (15 s)" : e?.message ?? e}`, 0);
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const err = json?.error ?? {};
    throw new GraphError(`Meta: ${err.message ?? `HTTP ${res.status}`}`, res.status, err.code, err.error_subcode);
  }
  return json;
}

/**
 * Graph API so'rovi. Token berilsa `appsecret_proof` ham qo'shiladi (App Secret ma'lum bo'lsa) - tokenni
 * o'g'irlagan odam uni boshqa joydan ishlata olmasligi uchun.
 */
export function graph(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | undefined> = {}, auth?: { token?: string | null; appSecret?: string | null }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  if (auth?.token) {
    q.set("access_token", auth.token);
    if (auth.appSecret) q.set("appsecret_proof", proof(auth.token, auth.appSecret));
  }
  return send(method, `${graphBase()}/${graphVersion()}/${path.replace(/^\/+/, "")}?${q.toString()}`);
}

/** Sahifalangan ro'yxatni to'liq oladi (paging.next bo'yicha, ko'pi bilan `maxPages` sahifa). */
export async function graphAll(path: string, params: Record<string, string | undefined>, auth: { token?: string | null; appSecret?: string | null }, maxPages = 10): Promise<any[]> {
  const out: any[] = [];
  let page = await graph("GET", path, { limit: "100", ...params }, auth);
  for (let i = 0; i < maxPages; i++) {
    out.push(...(page?.data ?? []));
    const after = page?.paging?.cursors?.after;
    if (!page?.paging?.next || !after) break;
    page = await graph("GET", path, { limit: "100", ...params, after }, auth);
  }
  return out;
}
