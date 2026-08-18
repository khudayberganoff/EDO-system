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

import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // DDOS/brute-force'dan asosiy himoya
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "uploads"),
      serveRoot: "/uploads",
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DocumentsModule,
    SignaturesModule,
    AuditLogModule,
    LettersModule,
  ],
  providers: [
    // Tartib muhim: avval kim ekanligini aniqlaymiz (JWT), keyin nima qila olishini (Roles)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
