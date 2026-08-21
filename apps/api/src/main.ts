import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { join } from "path";
import { existsSync } from "fs";
import { AppModule } from "./app.module";
import { runBootstrapSeed } from "./bootstrap-seed";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? ["http://localhost:5173"];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-server so'rovlar
      callback(null, true);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  });
  void allowedOrigins;

  app.setGlobalPrefix("api");

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
