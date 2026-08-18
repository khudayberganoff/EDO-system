import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

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

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:5173",
    credentials: true,
  });

  app.setGlobalPrefix("api");

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
}

bootstrap();
