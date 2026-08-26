import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ImapFlow } = require("imapflow");

/**
 * Tashqi pochta qutilari (IMAP) bilan ishlash: sozlamalarni saqlash va
 * kiruvchi xatlarni tizimga olib kelish.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private prisma: PrismaService) {}

  // --- Parolni shifrlash: bazada ochiq holda saqlanmasin ---

  private get secretKey(): Buffer {
    const secret = process.env.JWT_SECRET ?? "edo-local-development-secret";
    return scryptSync(secret, "mail-account-salt", 32);
  }

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", this.secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
  }

  private decrypt(payload: string): string {
    const [ivHex, dataHex] = payload.split(":");
    const decipher = createDecipheriv("aes-256-cbc", this.secretKey, Buffer.from(ivHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  }

  // --- Pochta qutilari ---

  async listAccounts() {
    const accounts = await this.prisma.mailAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { mails: true } } },
    });
    // Parol hech qachon qaytarilmaydi
    return accounts.map(({ password, ...rest }) => rest);
  }

  async createAccount(data: {
    name: string; email: string; imapHost: string; imapPort?: number;
    useSsl?: boolean; username: string; password: string;
  }) {
    if (!data.password) throw new BadRequestException("Parolni kiriting.");
    const account = await this.prisma.mailAccount.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        imapHost: data.imapHost.trim(),
        imapPort: data.imapPort ?? 993,
        useSsl: data.useSsl ?? true,
        username: data.username.trim(),
        // Gmail ilova parolini bo'shliqlar bilan ko'rsatadi - ularni tozalaymiz
        password: this.encrypt(data.password.replace(/\s+/g, "")),
      },
    });
    const { password, ...rest } = account;
    return rest;
  }

  async updateAccount(id: string, data: Partial<{ name: string; isActive: boolean; password: string }>) {
    const account = await this.prisma.mailAccount.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        isActive: data.isActive,
        ...(data.password ? { password: this.encrypt(data.password.replace(/\s+/g, "")) } : {}),
      },
    });
    const { password, ...rest } = account;
    return rest;
  }

  async removeAccount(id: string) {
    await this.prisma.mailAccount.delete({ where: { id } });
    return { deleted: true };
  }

  /** Ulanishni tekshirish - sozlamalar to'g'riligini bilish uchun. */
  async testConnection(id: string) {
    const account = await this.prisma.mailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException("Pochta qutisi topilmadi.");

    const client = this.buildClient(account);
    try {
      await client.connect();
      await client.logout();
      await this.prisma.mailAccount.update({ where: { id }, data: { lastError: null } });
      return { ok: true, message: "Ulanish muvaffaqiyatli." };
    } catch (err: any) {
      const message = this.friendlyError(err, account.imapHost);
      await this.prisma.mailAccount.update({ where: { id }, data: { lastError: message } });
      return { ok: false, message };
    }
  }


  /**
   * IMAP xatolarini foydalanuvchi tushunadigan, aniq maslahatli xabarga aylantiradi.
   * Server odatda "Command failed" kabi quruq matn qaytaradi - undan foyda yo'q.
   */
  private friendlyError(err: any, host: string): string {
    const raw = [err?.responseText, err?.response, err?.message, String(err ?? "")].filter(Boolean).join(" ");
    const text = raw.toLowerCase();
    const isGmail = host.includes("gmail") || host.includes("google");

    if (text.includes("application-specific password") || text.includes("web login required")) {
      return "Google oddiy parolni qabul qilmadi. Hisobingizda 2 bosqichli tasdiqlashni yoqing va \"Ilova parollari\" (App passwords) bo'limidan 16 belgili maxsus parol yarating - shu parolni kiriting.";
    }
    if (text.includes("authenticationfailed") || text.includes("invalid credentials") ||
        text.includes("auth") && text.includes("fail") || text.includes("login failed") ||
        text.includes("command failed")) {
      return isGmail
        ? "Login yoki parol qabul qilinmadi. Gmail uchun oddiy parol ishlamaydi: 2 bosqichli tasdiqlashni yoqib, \"Ilova parollari\" bo'limidan 16 belgili parol yarating (bo'sh joysiz kiriting). Shuningdek Gmail sozlamalarida IMAP yoqilganini tekshiring."
        : "Login yoki parol qabul qilinmadi. Ko'pchilik xizmatlar oddiy parol o'rniga alohida \"ilova paroli\" talab qiladi - pochta sozlamalaridan shunday parol yarating.";
    }
    if (text.includes("enotfound") || text.includes("getaddrinfo")) {
      return `IMAP server topilmadi (${host}). Manzil to'g'ri yozilganini tekshiring.`;
    }
    if (text.includes("econnrefused")) {
      return `Server ulanishni rad etdi (${host}). Port yoki SSL sozlamasi noto'g'ri bo'lishi mumkin.`;
    }
    if (text.includes("etimedout") || text.includes("timeout")) {
      return "Serverga ulanish vaqti tugadi. Tarmoq yoki server manzilini tekshiring.";
    }
    if (text.includes("certificate") || text.includes("self signed")) {
      return "SSL sertifikati bilan muammo. Server sozlamalarini tekshiring.";
    }
    if (text.includes("imap") && text.includes("disabled")) {
      return "Pochta qutingizda IMAP o'chirilgan. Pochta sozlamalaridan IMAP'ni yoqing.";
    }
    return err?.message ? `Ulanib bo'lmadi: ${err.message}` : "Ulanib bo'lmadi. Sozlamalarni tekshiring.";
  }

  private buildClient(account: { imapHost: string; imapPort: number; useSsl: boolean; username: string; password: string }) {
    return new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.useSsl,
      auth: { user: account.username, pass: this.decrypt(account.password) },
      logger: false,
      // Server javob bermasa - uzoq kutib qolmasin
      socketTimeout: 20000,
      greetingTimeout: 10000,
      connectionTimeout: 15000,
    });
  }

  // --- Kiruvchi xatlar ---

  async listMails(query: { accountId?: string; unreadOnly?: boolean } = {}) {
    return this.prisma.incomingMail.findMany({
      where: {
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { account: { select: { name: true, email: true } } },
    });
  }

  async markRead(id: string, isRead: boolean) {
    return this.prisma.incomingMail.update({ where: { id }, data: { isRead } });
  }

  async removeMail(id: string) {
    await this.prisma.incomingMail.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Pochtadan yangi xatlarni olib keladi (oxirgi 50 ta).
   * Takror yuklanmasligi uchun har bir xabarning messageId si tekshiriladi.
   */
  async syncAccount(id: string) {
    const account = await this.prisma.mailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException("Pochta qutisi topilmadi.");
    if (!account.isActive) throw new BadRequestException("Bu pochta qutisi o'chirilgan.");

    const client = this.buildClient(account);
    let imported = 0;

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const total = client.mailbox.exists;
        if (total > 0) {
          const from = Math.max(1, total - 49); // oxirgi 50 ta xat
          for await (const message of client.fetch(`${from}:*`, { envelope: true, bodyStructure: true, source: false })) {
            const envelope = message.envelope;
            const messageId = envelope?.messageId ?? `uid-${account.id}-${message.uid}`;

            const exists = await this.prisma.incomingMail.findUnique({ where: { messageId } });
            if (exists) continue;

            const sender = envelope?.from?.[0];
            await this.prisma.incomingMail.create({
              data: {
                accountId: account.id,
                messageId,
                fromName: sender?.name ?? null,
                fromEmail: sender?.address ?? "—",
                subject: envelope?.subject ?? "(mavzusiz)",
                receivedAt: envelope?.date ?? new Date(),
                hasAttachments: Boolean(message.bodyStructure?.childNodes?.some((n: any) => n.disposition === "attachment")),
              },
            });
            imported += 1;
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();

      await this.prisma.mailAccount.update({
        where: { id },
        data: { lastSyncAt: new Date(), lastError: null },
      });
      return { imported };
    } catch (err: any) {
      const message = this.friendlyError(err, account.imapHost);
      this.logger.error(`Pochta sinxronizatsiyasi xatosi: ${err?.message ?? err}`);
      await this.prisma.mailAccount.update({ where: { id }, data: { lastError: message } });
      throw new BadRequestException(message);
    }
  }
}
