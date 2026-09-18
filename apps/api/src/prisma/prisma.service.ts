import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Diqqat: bu yerda ataylab OnModuleInit ishlatilmaydi va $connect() chaqirilmaydi.
 *
 * Sabab: agar $connect() NestFactory.create() paytida (ya'ni app.listen(port)
 * dan OLDIN) chaqirilsa va baza o'sha daqiqada hali tayyor bo'lmasa (masalan
 * Render'dagi bepul Postgres "uyqudan" uyg'onayotgan bo'lsa yoki tarmoqda
 * vaqtincha uzilish bo'lsa) - Prisma xatolik (P1001) tashlaydi, bu esa butun
 * Node jarayonini o'ldiradi: port HECH QACHON ochilmaydi va platforma
 * konteynerni "ishga tushmadi" deb hisoblab, uni o'chirib qo'yadi.
 *
 * Buning oldini olish uchun (xuddi bootstrap-seed.ts'dagi kabi - server avval
 * portni ochadi, keyin bazani orqa fonda tayyorlaydi) - Prisma Client'ning
 * o'zining LAZY ulanishiga tayanamiz: u birinchi haqiqiy so'rov (masalan
 * `user.findUnique(...)`) chaqirilganda o'zi ulanadi, shu bois bazaga ulanish
 * app.listen() dan keyin, birinchi so'rov kelganda amalga oshadi.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    // Baza tayyor bo'lishi bilanoq ulanib olish uchun urinib ko'ramiz (foydali -
    // birinchi haqiqiy so'rov sekinlashmasin), lekin bu MUVAFFAQIYATSIZ bo'lsa ham
    // ilova ishga tushishda davom etadi (xato faqat logga yoziladi).
    this.$connect().catch((err) => {
      this.logger.warn(`Bazaga oldindan ulanib bo'lmadi (birinchi so'rovda qayta urinib ko'riladi): ${err?.message ?? err}`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
