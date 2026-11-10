import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";

import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { DocumentsModule } from "./documents/documents.module";
import { SignaturesModule } from "./signatures/signatures.module";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { LettersModule } from "./letters/letters.module";
import { HrModule } from "./hr/hr.module";
import { PublicApiModule } from "./public-api/public-api.module";
import { SettingsModule } from "./settings/settings.module";
import { MailModule } from "./mail/mail.module";
import { DailyTasksModule } from "./daily-tasks/daily-tasks.module";
import { BoardModule } from "./board/board.module";
import { TelegramModule } from "./telegram/telegram.module";
import { CrmModule } from "./crm/crm.module";
import { CallsModule } from "./calls/calls.module";
import { TelephonyModule } from "./telephony/telephony.module";

import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { ObserverGuard } from "./common/guards/observer.guard";
import { OperatorGuard } from "./common/guards/operator.guard";
import { ModuleAccessGuard } from "./common/guards/module-access.guard";
import { throttleTracker } from "./common/throttle-tracker";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // So'rovlar cheklovi. Ofisdagi hamma bitta tashqi IP ortida bo'lishi mumkin, shuning uchun tizimga kirgan
    // foydalanuvchi o'z tokeni bo'yicha hisoblanadi (har biriga alohida limit), kirmaganlar esa IP bo'yicha.
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 300, getTracker: throttleTracker },
      { name: "ip", ttl: 60_000, limit: 3000, getTracker: (req) => `ip:${req.ip ?? ""}` },
    ]),
    ServeStaticModule.forRoot(
      {
        rootPath: join(__dirname, "..", "uploads"),
        serveRoot: "/uploads",
        // Nuqta bilan boshlanadigan papkalar (uploads/.private - xodim rasmi va obyektivkasi)
        // ommaviy berilmaydi, ular faqat avtorizatsiyalangan API orqali yuklab olinadi.
        serveStaticOptions: { dotfiles: "ignore" },
      },
      {
        // Frontend build (apps/web/dist) - bitta xizmat sifatida deploy qilinganda
        rootPath: join(__dirname, "..", "..", "web", "dist"),
        exclude: ["/api*", "/uploads*"],
        serveStaticOptions: {
          index: false,
          // Vite yig'gan fayllar nomida xesh bor (index-AbC123.js) - ular hech qachon o'zgarmaydi, bir yilga keshlanadi.
          // Qolgan statik fayllar (logotip, favicon) bir kunga.
          setHeaders: (res, filePath) => {
            if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            else if (!filePath.endsWith(".html")) res.setHeader("Cache-Control", "public, max-age=86400");
          },
        },
      },
    ),
    PrismaModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    SignaturesModule,
    AuditLogModule,
    LettersModule,
    HrModule,
    PublicApiModule,
    SettingsModule,
    MailModule,
    DailyTasksModule,
    BoardModule,
    TelegramModule,
    CrmModule,
    CallsModule,
    TelephonyModule,
  ],
  providers: [
    // Tartib muhim: avval kim ekanligini aniqlaymiz (JWT), keyin nima qila olishini (Roles)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ObserverGuard },
    { provide: APP_GUARD, useClass: OperatorGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
