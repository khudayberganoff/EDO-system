import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import compression = require("compression");
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { join } from "path";
import { existsSync } from "fs";
import { AppModule } from "./app.module";
import { runBootstrapSeed } from "./bootstrap-seed";
import { isCallHost, isCallSiteApiPath } from "./common/site-mode";

async function bootstrap() {
  // Maxfiy kalitsiz ishlab bo'lmaydi: aks holda tokenlarni istalgan kishi yasay olardi
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET o'rnatilmagan: production rejimida server ishga tushmaydi.");
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Server reverse proxy (Caddy/nginx) ortida turadi: mijozning haqiqiy IP manzili X-Forwarded-For'dan olinadi.
  // Faqat xususiy tarmoqdagi proxy'ga ishoniladi (to'g'ridan-to'g'ri kelgan so'rov sarlavhani soxtalashtira olmaydi).
  // Busiz barcha foydalanuvchilar bitta IP (proxy) bo'lib ko'rinadi va so'rovlar cheklovi hammaga umumiy bo'lib qoladi.
  app.set("trust proxy", "loopback, linklocal, uniquelocal");
  app.disable("x-powered-by");

  // Javoblarni siqish (gzip): JS/CSS/JSON 3-4 baravar kichrayadi. Audio/rasm kabi siqilgan fayllarga tegilmaydi.
  app.use(compression({ threshold: 1024 }));

  // Asosiy xavfsizlik sarlavhalari
  app.use((_req: any, res: any, next: any) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Faqat DTO'da e'lon qilingan maydonlarni qabul qilamiz - xavfsizlik uchun muhim
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Asosiy interfeys uchun - faqat ruxsat etilgan manzillar.
  // Ochiq API (/api/public/*) esa API kalit bilan himoyalangani uchun
  // istalgan saytdan chaqirilishi mumkin.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  const isProduction = process.env.NODE_ENV === "production";
  app.enableCors((req: any, callback: (err: Error | null, options?: any) => void) => {
    const origin: string | undefined = req.headers.origin;
    const path: string = String(req.url ?? "").split("?")[0];
    let allowed = false;
    if (!origin) allowed = true; // server-server so'rovlar (brauzer emas)
    else if (path.startsWith("/api/public/")) allowed = true; // ochiq API - API kalit bilan himoyalangan
    else if (allowedOrigins.includes(origin)) allowed = true;
    else {
      try {
        const host = new URL(origin).host;
        // Sayt o'z manzilidan (edo.*, call.* ...) murojaat qilyapti
        if (host === (req.headers["x-forwarded-host"] ?? req.headers.host)) allowed = true;
        // Mahalliy ishlab chiqish: istalgan localhost porti
        else if (!isProduction && /^(.+\.)?localhost(:\d+)?$/.test(host)) allowed = true;
      } catch { /* noto'g'ri Origin - ruxsat yo'q */ }
    }
    callback(null, { origin: allowed, allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Webhook-Token"] });
  });

  app.setGlobalPrefix("api");

  // call.* sayti: faqat Call-markaz API'si (kirish, qo'ng'iroqlar, ruxsatlar). Qolgan bo'limlar bu manzilda yo'q.
  app.use((req: any, res: any, next: any) => {
    const host = req.headers["x-forwarded-host"] ?? req.headers.host;
    if (isCallHost(host) && req.path.startsWith("/api") && !req.path.startsWith("/api/docs") && !isCallSiteApiPath(req.path)) {
      return res.status(404).json({ statusCode: 404, message: "Bu manzilda mavjud emas." });
    }
    next();
  });

  // Frontend (React/Vite) shu API bilan bitta serverda birga joylashtirilgan
  // bo'lsa (Render kabi bir xizmatli deploy), SPA marshrutlash uchun
  // /api va /uploads dan boshqa barcha so'rovlarni index.html'ga yo'naltiramiz.
  const webDistPath = join(__dirname, "..", "..", "web", "dist");
  if (existsSync(webDistPath)) {
    app.use((req: any, res: any, next: any) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
        return next();
      }
      if (req.path.includes(".")) {
        return next(); // statik fayl (js/css/rasm) bo'lsa, static middleware o'zi topadi
      }
      // index.html keshlanmaydi: yangi versiya chiqqanda brauzer darhol yangi (xeshli) fayllarni oladi
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(webDistPath, "index.html"));
    });
  }

  const config = new DocumentBuilder()
    .setTitle("EDO API")
    .setDescription("Elektron hujjat aylanishi tizimi - REST API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port);
  console.log(`EDO API ${port}-portda ishga tushdi. Docs: /api/docs`);

  // Port ochilgandan keyin - shunda platforma serverni "tirik" deb hisoblaydi
  void runBootstrapSeed();
}

bootstrap();
