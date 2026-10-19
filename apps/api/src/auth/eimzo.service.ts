import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import * as http from "http";
import * as https from "https";
import { PrismaService } from "../prisma/prisma.service";

const SETTING_KEY = "eimzo";

export interface EimzoConfig {
  /** e-imzo-server manzili, masalan http://127.0.0.1:8080 */
  serverUrl: string;
  /** Sayt domeni (E-IMZO API-KEY shu domen uchun beriladi) */
  domain: string;
  /** NIC NT bergan API-KEY (brauzerga beriladi - maxfiy emas) */
  apiKey: string;
}

export interface EimzoCertificate {
  pinfl: string | null;
  tin: string | null;
  name: string | null;
  serialNumber: string | null;
}

/** OID -> qiymat; subjectName obyekt yoki "CN=..,1.2.860.3.16.1.2=.." qatori bo'lishi mumkin. */
function parseSubject(subject: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (subject && typeof subject === "object") {
    for (const [k, v] of Object.entries(subject as Record<string, unknown>)) if (v != null) out[k.toUpperCase()] = String(v);
  } else if (typeof subject === "string") {
    for (const part of subject.split(/,(?=\s*[A-Za-z0-9.]+=)/)) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
    }
  }
  return out;
}

/**
 * ERI (E-IMZO) orqali kirish: brauzer E-IMZO dasturi bilan challenge'ni imzolaydi, bu yerda esa
 * e-imzo-server (NIC NT) imzo va sertifikatni tekshiradi. Sozlamalar saytdan (Tashqi tizimlar) kiritiladi
 * yoki EIMZO_SERVER_URL / EIMZO_DOMAIN / EIMZO_API_KEY o'zgaruvchilaridan olinadi.
 */
@Injectable()
export class EimzoService {
  constructor(private prisma: PrismaService) {}

  async getConfig(): Promise<{ config: EimzoConfig | null; source: "env" | "db" | null }> {
    const { EIMZO_SERVER_URL, EIMZO_DOMAIN, EIMZO_API_KEY } = process.env;
    if (EIMZO_SERVER_URL && EIMZO_DOMAIN && EIMZO_API_KEY) {
      return { config: { serverUrl: EIMZO_SERVER_URL, domain: EIMZO_DOMAIN, apiKey: EIMZO_API_KEY }, source: "env" };
    }
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row) {
      try {
        const c = JSON.parse(row.value) as EimzoConfig;
        if (c.serverUrl && c.domain && c.apiKey) return { config: c, source: "db" };
      } catch { /* buzilgan yozuv - sozlanmagan deb hisoblanadi */ }
    }
    return { config: null, source: null };
  }

  private normalize(input: Partial<EimzoConfig>): EimzoConfig {
    const serverUrl = (input.serverUrl ?? "").trim().replace(/\/+$/, "");
    const domain = (input.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const apiKey = (input.apiKey ?? "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(serverUrl)) throw new BadRequestException("E-IMZO server manzili noto'g'ri (masalan: http://127.0.0.1:8080).");
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(domain)) throw new BadRequestException("Domen noto'g'ri (masalan: edo.wafaleasing.uz).");
    if (apiKey.length < 16) throw new BadRequestException("API-KEY noto'g'ri: NIC NT bergan kalitni to'liq kiriting.");
    return { serverUrl, domain, apiKey };
  }

  /** Saqlashdan oldin server javob berishini tekshiradi (challenge so'raladi). */
  async saveConfig(input: Partial<EimzoConfig>) {
    const config = this.normalize(input);
    await this.challengeWith(config);
    await this.prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) },
    });
    return config;
  }

  async removeConfig() {
    await this.prisma.appSetting.deleteMany({ where: { key: SETTING_KEY } });
  }

  async publicConfig() {
    const { config } = await this.getConfig();
    return { enabled: !!config, apiKeys: config ? [config.domain, config.apiKey] : [] };
  }

  async challenge(): Promise<string> {
    const { config } = await this.getConfig();
    if (!config) throw new ServiceUnavailableException("ERI orqali kirish hali sozlanmagan.");
    return this.challengeWith(config);
  }

  private async challengeWith(config: EimzoConfig): Promise<string> {
    const res = await this.request(config, "GET", "/frontend/challenge");
    if (res.body?.status !== 1 || !res.body?.challenge) {
      throw new ServiceUnavailableException(`E-IMZO server challenge bermadi${res.body?.message ? `: ${res.body.message}` : "."}`);
    }
    return String(res.body.challenge);
  }

  /** PKCS#7 ni e-imzo-server orqali tekshiradi va sertifikat ma'lumotlarini qaytaradi. */
  async verify(pkcs7: string, clientIp: string): Promise<EimzoCertificate> {
    const { config } = await this.getConfig();
    if (!config) throw new ServiceUnavailableException("ERI orqali kirish hali sozlanmagan.");
    const res = await this.request(config, "POST", "/backend/auth", pkcs7, { "X-Real-IP": clientIp || "127.0.0.1" });
    const body = res.body;
    if (body?.status !== 1) {
      throw new BadRequestException(this.explain(body?.status, body?.message));
    }
    const info = body.subjectCertificateInfo ?? {};
    const subject = parseSubject(info.subjectName);
    const digits = (v?: string) => (v && /^\d+$/.test(v.trim()) ? v.trim() : null);
    // 1.2.860.3.16.1.2 - JSHSHIR (14), 1.2.860.3.16.1.1 - STIR (9): qiymat uzunligiga qarab ajratiladi
    const candidates = [subject["1.2.860.3.16.1.2"], subject["1.2.860.3.16.1.1"], subject["PINFL"], subject["UID"], subject["TIN"]]
      .map(digits).filter((v): v is string => !!v);
    return {
      pinfl: candidates.find((v) => v.length === 14) ?? null,
      tin: candidates.find((v) => v.length === 9) ?? null,
      name: subject["CN"] ?? null,
      serialNumber: info.serialNumber ?? null,
    };
  }

  private explain(status?: number, message?: string): string {
    switch (status) {
      case -20: return "Challenge eskirgan yoki topilmadi. Qaytadan urinib ko'ring.";
      case -10: return "Imzo noto'g'ri.";
      case -11: case -12: return "ERI sertifikati yaroqsiz yoki muddati tugagan.";
      case -5: return "Imzolash vaqti ruxsat etilgan oraliqdan tashqarida. Kompyuter vaqtini tekshiring.";
      case -1: return "Sertifikat holatini tekshirib bo'lmadi (E-IMZO serverining VPN/OCSP ulanishini tekshiring).";
      default: return message ? `ERI tekshiruvi rad etildi: ${message}` : "ERI tekshiruvi rad etildi.";
    }
  }

  private request(config: EimzoConfig, method: "GET" | "POST", path: string, body?: string, extra: Record<string, string> = {}): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try { url = new URL(config.serverUrl + path); } catch { return reject(new ServiceUnavailableException("E-IMZO server manzili noto'g'ri.")); }
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        url,
        {
          method,
          timeout: 15_000,
          headers: {
            Host: config.domain,
            "Cache-Control": "no-cache",
            ...(body !== undefined ? { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) } : {}),
            ...extra,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = null;
            try { parsed = JSON.parse(text); } catch { /* JSON emas */ }
            if (!parsed) return reject(new ServiceUnavailableException(`E-IMZO server kutilmagan javob berdi (HTTP ${res.statusCode}).`));
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", () => reject(new ServiceUnavailableException("E-IMZO serveriga ulanib bo'lmadi. Manzilni va server ishlayotganini tekshiring.")));
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
}
