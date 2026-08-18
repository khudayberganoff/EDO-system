import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LetterStatus, LetterType } from "../common/enums";

interface GenerateInput {
  type: LetterType;
  documentDate: string;
  counterpartyType?: string;
  counterpartyName: string;
  counterpartyAddress?: string;
  summary: string;
  contractNumber?: string;
  contractDate?: string;
  monthlyPaymentAmount?: number;
  overdueDays?: number;
  charityAmount?: number;
}

export interface GenerateResult {
  text: string;
  provider: "openai" | "local";
  learnedFrom: number;
}

/**
 * Xatlar yozish uchun mas'ul AI agent.
 *
 * "O'zini-o'zi o'rgatish" shu tarzda amalga oshiriladi: agent har safar
 * yangi xat yozishdan oldin ARXIVLANGAN (rahbariyat tomonidan tasdiqlangan)
 * xatlar orasidan bir xil turdagi eng so'nggi namunalarni tanlab oladi va
 * ularni "yaxshi yozilgan namuna" sifatida promptga qo'shadi. Natijada,
 * tizimda qancha ko'p tasdiqlangan xat to'planib borsa, agent shuncha
 * "tajribali" bo'lib, ularning uslubi va tuzilishiga mos yozadi - bu
 * klassik retrieval-based o'rganish yondashuvi (haqiqiy modelni qayta
 * o'qitmasdan, eng dolzarb va tasdiqlangan namunalardan foydalanish).
 */
@Injectable()
export class LetterAiAgentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Har bir turdagi tasdiqlangan xatlar soni - "agent nechta namunadan
   * o'rgangani"ni frontendda ko'rsatish uchun.
   */
  async getLearningStats() {
    const [warning, reference, letter, total] = await this.prisma.$transaction([
      this.prisma.letter.count({ where: { type: LetterType.WARNING, status: LetterStatus.ARCHIVED } }),
      this.prisma.letter.count({ where: { type: LetterType.REFERENCE, status: LetterStatus.ARCHIVED } }),
      this.prisma.letter.count({ where: { type: LetterType.LETTER, status: LetterStatus.ARCHIVED } }),
      this.prisma.letter.count({ where: { status: LetterStatus.ARCHIVED } }),
    ]);
    return { WARNING: warning, REFERENCE: reference, LETTER: letter, total };
  }

  private async getReferenceExamples(type: LetterType, limit = 3) {
    return this.prisma.letter.findMany({
      where: { type, status: LetterStatus.ARCHIVED, bodyText: { not: null } },
      orderBy: { approvedAt: "desc" },
      take: limit,
      select: { bodyText: true, counterpartyName: true, summary: true },
    });
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const examples = await this.getReferenceExamples(input.type, 3);
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const prompt = this.buildPrompt(input, examples);
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            temperature: 0.25,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (response.ok) {
          const json: any = await response.json();
          const text = json?.choices?.[0]?.message?.content?.trim();
          if (text) return { text, provider: "openai", learnedFrom: examples.length };
        }
      } catch {
        // OpenAI mavjud bo'lmasa yoki xatolik bo'lsa - jimgina mahalliy yozuvchiga o'tamiz
      }
    }

    return { text: this.localDraft(input, examples), provider: "local", learnedFrom: examples.length };
  }

  private buildPrompt(
    input: GenerateInput,
    examples: Array<{ bodyText: string | null; counterpartyName: string; summary: string }>,
  ) {
    const examplesBlock =
      examples.length > 0
        ? "Quyidagilar avval rahbariyat tomonidan TASDIQLANGAN, xuddi shu turdagi xatlarning matnlari. Ularning rasmiy uslubi, jumla tuzilishi va ohangiga to'liq mos yozing (lekin mazmunini nusxalamang, faqat uslubni o'rganing):\n\n" +
          examples
            .map((e, i) => `--- Namuna ${i + 1} (${e.counterpartyName}) ---\n${e.bodyText}`)
            .join("\n\n")
        : "Hozircha shu turdagi tasdiqlangan namuna yo'q - eng yaxshi amaliyot asosida rasmiy uslubda yozing.";

    const warningDetails =
      input.type === LetterType.WARNING
        ? this.formatWarningDetails(input)
        : "";

    return [
      "Siz O'zbekistondagi \"WAFA LEASING\" MChJ (islomiy moliyalashtirish kompaniyasi) uchun rasmiy ish yuritish bo'yicha mas'ul AI yordamchisisiz.",
      "Vazifangiz: rasmiy, grammatik jihatdan to'g'ri, tushunarli va qat'iy o'zbek (lotin) tilida xat matnini yozish.",
      "",
      examplesBlock,
      "",
      `Xat turi: ${input.type}`,
      `Kimga: ${input.counterpartyName}`,
      `Manzil: ${input.counterpartyAddress || "ko'rsatilmagan"}`,
      `Qisqacha mazmun: ${input.summary}`,
      warningDetails,
      "",
      "Faqat xatning asosiy matnini qaytaring (sarlavha yoki imzo qo'shmang); salomlashuv, murojaat sababi, asosiy mazmun, zarur bo'lsa aniq talab/iltimos va yakuniy jumlalar bo'lsin.",
      "Agar yuqorida shartnoma raqami, summasi yoki kunlar soni berilgan bo'lsa - ularni matnda aniq va aniqlik bilan ishlating. Boshqa hech qanday faktni o'ylab topmang.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private formatWarningDetails(input: GenerateInput): string {
    const lines: string[] = [];
    if (input.contractNumber) lines.push(`Shartnoma raqami: ${input.contractNumber}`);
    if (input.contractDate) lines.push(`Shartnoma sanasi: ${this.formatDate(input.contractDate)}`);
    if (typeof input.monthlyPaymentAmount === "number") {
      lines.push(`Oylik to'lov summasi: ${this.formatMoney(input.monthlyPaymentAmount)} so'm`);
    }
    if (typeof input.overdueDays === "number") {
      lines.push(`Kechikkan kunlar soni: ${input.overdueDays} kun`);
    }
    if (typeof input.charityAmount === "number") {
      lines.push(`Kechikish uchun xayriya to'lovi summasi: ${this.formatMoney(input.charityAmount)} so'm`);
    }
    return lines.length > 0 ? "\nOgohlantirish uchun aniq ma'lumotlar:\n" + lines.join("\n") : "";
  }

  private formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("uz-UZ");
    } catch {
      return iso;
    }
  }

  private formatMoney(amount: number): string {
    return new Intl.NumberFormat("uz-UZ").format(Math.round(amount));
  }

  /**
   * OpenAI mavjud bo'lmaganda ishlatiladigan mahalliy yozuvchi.
   * U ham tasdiqlangan namunalardan (agar mavjud bo'lsa) eng so'nggisining
   * ohangiga moslashtiriladi, va WARNING turi uchun aniq raqamlarni matnga
   * to'g'ridan-to'g'ri qo'shadi - shunchaki umumiy shablon emas.
   */
  private localDraft(
    input: GenerateInput,
    examples: Array<{ bodyText: string | null; counterpartyName: string; summary: string }>,
  ): string {
    const greeting = input.counterpartyName ? `Hurmatli ${input.counterpartyName} rahbariyati!` : "Hurmatli hamkor!";
    const address = input.counterpartyAddress ? `Murojaat manzili: ${input.counterpartyAddress}.` : "";
    const typeText =
      input.type === LetterType.WARNING ? "ogohlantirish" : input.type === LetterType.REFERENCE ? "ma'lumotnoma" : "rasmiy xat";

    let body = `"WAFA LEASING" MChJ tomonidan ushbu ${typeText} ${input.summary.trim()} masalasi yuzasidan yuborilmoqda.`;

    if (input.type === LetterType.WARNING) {
      const details: string[] = [];
      if (input.contractNumber) {
        details.push(
          `${input.contractDate ? this.formatDate(input.contractDate) + " sanadagi " : ""}№ ${input.contractNumber} - sonli shartnomaga muvofiq`,
        );
      }
      if (typeof input.monthlyPaymentAmount === "number") {
        details.push(`oylik to'lov summasi ${this.formatMoney(input.monthlyPaymentAmount)} so'mni tashkil etadi`);
      }
      if (typeof input.overdueDays === "number" && input.overdueDays > 0) {
        details.push(`to'lov bo'yicha ${input.overdueDays} kunlik kechikish yuzaga kelgan`);
      }
      if (typeof input.charityAmount === "number" && input.charityAmount > 0) {
        details.push(
          `kechikish sabab hisoblangan xayriya to'lovi summasi ${this.formatMoney(input.charityAmount)} so'mni tashkil etadi`,
        );
      }
      if (details.length > 0) {
        body += `\n\n${this.capitalize(details.join(", "))}. Ushbu qarzdorlikni imkon qadar qisqa muddatda to'liq yopishingizni so'raymiz, aks holda shartnoma shartlariga muvofiq choralar ko'rilishi mumkinligini ma'lum qilamiz.`;
      }
    }

    body += `\n\nMazkur masala bo'yicha holatni ko'rib chiqishingiz hamda zarur choralarni ko'rishingizni so'raymiz.\n\nHamkorligingiz uchun minnatdorchilik bildiramiz.`;

    const referenceNote = examples.length > 0 ? "" : "";

    return [greeting, address, body, referenceNote]
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
