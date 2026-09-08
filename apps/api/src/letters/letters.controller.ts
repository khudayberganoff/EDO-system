import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import * as XLSX from "xlsx";
import { LettersService } from "./letters.service";
import { CreateLetterDto } from "./dto/create-letter.dto";
import { QueryLettersDto } from "./dto/query-letters.dto";
import { letterheadUploadOptions } from "./letterhead.multer.config";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { LetterStatus, LetterType, Role } from "../common/enums";
import { Roles } from "../common/decorators/roles.decorator";

const TYPE_LABELS: Record<LetterType, string> = { [LetterType.FIRST_WARNING]: "1-ogohlantirish", [LetterType.FINAL_WARNING]: "Yakuniy ogohlantirish", [LetterType.REFERENCE]: "Ma’lumotnoma", [LetterType.LETTER]: "Xat" };
const STATUS_LABELS: Record<string, string> = { DRAFT: "Qoralama", PENDING_APPROVAL: "Rahbariyat tasdig‘ida", APPROVED: "Tasdiqlangan", ARCHIVED: "Arxivlangan", DELETED: "O‘chirilgan", NEW: "Yangi" };

@ApiTags("letters") @ApiBearerAuth() @Controller("letters")
export class LettersController {
  constructor(private lettersService: LettersService) {}

  @Post() create(@Body() dto: CreateLetterDto, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.create(dto, user.id); }

  @Post("ai-generate") aiGenerate(@Body() body: any) { return this.lettersService.aiGenerate(body); }

  @Get() findAll(@Query() query: QueryLettersDto) { return this.lettersService.findAll(query); }
  @Get("counts") counts() { return this.lettersService.countsByDirection(); }
  @Get("approvers") @ApiOperation({ summary: "Tasdiqlashi mumkin bo'lgan rahbarlar" }) approvers() { return this.lettersService.listApprovers(); }
  @Get("archive") archive() { return this.lettersService.archiveList(); }
  @Get("next-number") nextNumber(@Query("type") type: LetterType, @Query("direction") direction: "INCOMING" | "OUTGOING" = "OUTGOING", @CurrentUser() user: AuthenticatedUser) {
    return this.lettersService.peekNextDocumentNumber(type, direction, user.id);
  }

  @Get("export") async export(@Query() query: QueryLettersDto, @Res() res: Response) {
    const letters = await this.lettersService.exportRows(query);
    const rows = letters.map((letter, index) => ({
      "T/r": index + 1,
      "Hujjat raqami": letter.documentNumber,
      "Sana": new Date(letter.documentDate).toLocaleDateString("uz-UZ"),
      "Yo'nalishi": letter.direction === "INCOMING" ? "Kiruvchi" : "Chiquvchi",
      "Xat turi": TYPE_LABELS[letter.type as LetterType] ?? letter.type,
      "Kimga": letter.counterpartyName,
      "Manzil": letter.counterpartyAddress ?? "",
      "Qisqacha mazmuni": letter.summary ?? "",
      "Holati": STATUS_LABELS[letter.status] ?? letter.status,
      "Mas'ul shaxs": letter.createdBy?.fullName ?? "—",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    // Ustun kengliklari - fayl ochilganda o'qishga qulay bo'lishi uchun
    worksheet["!cols"] = [
      { wch: 5 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
      { wch: 30 }, { wch: 24 }, { wch: 45 }, { wch: 18 }, { wch: 24 },
    ];
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Xatlar");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="EDO-xatlar-${new Date().toISOString().slice(0,10)}.xlsx"`); res.send(buffer);
  }

  @Get("ai-agent/stats") aiAgentStats() { return this.lettersService.getAiAgentStats(); }

  // --- Firma blankasi (letterhead) ---
  @Get("letterhead") getLetterhead() { return this.lettersService.getLetterheadStatus(); }

  @Post("letterhead")
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseInterceptors(FileInterceptor("file", letterheadUploadOptions))
  uploadLetterhead(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    return this.lettersService.uploadLetterhead(file, user);
  }

  @Delete("letterhead")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeLetterhead(@CurrentUser() user: AuthenticatedUser) {
    return this.lettersService.removeLetterhead(user);
  }

  // --- QR orqali ochiq tekshiruv (login talab qilinmaydi) ---
  @Public()
  @Get("verify/:id")
  verify(@Param("id") id: string, @Query("token") token: string) {
    return this.lettersService.verifyByToken(id, token);
  }

  /** QR sahifasidan PDF nusxani yuklab olish (login talab qilinmaydi, token bilan himoyalangan). */
  @Public()
  @Get("verify/:id/pdf")
  async verifyPdf(@Param("id") id: string, @Query("token") token: string, @Res() res: Response) {
    await this.lettersService.verifyByToken(id, token); // token to'g'riligini tekshiradi
    const { buffer, name } = await this.lettersService.buildPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buffer);
  }

  /** Xatning Word shablonidan olingan haqiqiy matni (ko'rish oynasi uchun). */
  @Get(":id/rendered-text")
  async renderedText(@Param("id") id: string) {
    return { paragraphs: await this.lettersService.getRenderedText(id) };
  }

  /** Tizim ichida: tasdiqlangan xatning PDF nusxasi. */
  @Get(":id/download-pdf")
  async downloadPdf(@Param("id") id: string, @Res() res: Response) {
    const { buffer, name } = await this.lettersService.buildPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(buffer);
  }

  @Get(":id") findOne(@Param("id") id: string) { return this.lettersService.findOne(id); }

  @Post(":id/submit") submit(@Param("id") id: string, @Body() body: { approverId?: string }, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.submitForApproval(id, user.id, body?.approverId); }
  @Patch(":id") updateBody(@Param("id") id: string, @Body() body: { bodyText?: string; summary?: string }, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.updateBody(id, body, user.id); }

  @Post(":id/approve") @Roles(Role.ADMIN, Role.MANAGER) approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.approve(id, user); }
  @Post(":id/reject") @Roles(Role.ADMIN, Role.MANAGER) reject(@Param("id") id: string, @Body() body: { reason: string }, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.reject(id, user, body?.reason ?? ""); }
  @Post(":id/delete") delete(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.softDelete(id, user.id); }

  @Get(":id/download/:kind") async download(@Param("id") id: string, @Param("kind") kind: "draft" | "final", @Res() res: Response) {
    const result = await this.lettersService.download(id, kind);
    res.download(result.full, result.name);
  }
}
