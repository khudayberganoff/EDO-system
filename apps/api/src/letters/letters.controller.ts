import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import * as XLSX from "xlsx";
import { LettersService } from "./letters.service";
import { CreateLetterDto } from "./dto/create-letter.dto";
import { QueryLettersDto } from "./dto/query-letters.dto";
import { letterheadUploadOptions } from "./letterhead.multer.config";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { LetterStatus, LetterType, Role } from "../common/enums";
import { Roles } from "../common/decorators/roles.decorator";

const TYPE_LABELS: Record<LetterType, string> = { [LetterType.WARNING]: "Ogohlantirish", [LetterType.REFERENCE]: "Ma’lumotnoma", [LetterType.LETTER]: "Xat" };
const STATUS_LABELS: Record<string, string> = { DRAFT: "Qoralama", PENDING_APPROVAL: "Rahbariyat tasdig‘ida", APPROVED: "Tasdiqlangan", ARCHIVED: "Arxivlangan", DELETED: "O‘chirilgan", NEW: "Yangi" };

@ApiTags("letters") @ApiBearerAuth() @Controller("letters")
export class LettersController {
  constructor(private lettersService: LettersService) {}

  @Post() create(@Body() dto: CreateLetterDto, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.create(dto, user.id); }

  @Post("ai-generate") aiGenerate(@Body() body: any) { return this.lettersService.aiGenerate(body); }

  @Get() findAll(@Query() query: QueryLettersDto) { return this.lettersService.findAll(query); }
  @Get("counts") counts() { return this.lettersService.countsByDirection(); }
  @Get("archive") archive() { return this.lettersService.archiveList(); }
  @Get("next-number") nextNumber(@Query("type") type: LetterType) { return this.lettersService.getNextDocumentNumber(type); }

  @Get("export") async export(@Query() query: QueryLettersDto, @Res() res: Response) {
    const letters = await this.lettersService.exportRows(query);
    const rows = letters.map((letter, index) => ({ "Tartib raqami": index + 1, "Kimga": letter.counterpartyName, "Sana": new Date(letter.documentDate).toLocaleDateString("uz-UZ"), "Hujjat raqami": `№ ${letter.documentNumber}`, "Xat turi": TYPE_LABELS[letter.type as LetterType] ?? letter.type, "Holati": STATUS_LABELS[letter.status] ?? letter.status, "Hujjat yaratgan mas’ul shaxs": letter.createdBy?.fullName ?? "—" }));
    const worksheet = XLSX.utils.json_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Xatlar");
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

  @Get(":id") findOne(@Param("id") id: string) { return this.lettersService.findOne(id); }
  @Post(":id/submit") submit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.submitForApproval(id, user.id); }
  @Post(":id/approve") @Roles(Role.ADMIN, Role.MANAGER) approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.approve(id, user); }
  @Post(":id/delete") delete(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) { return this.lettersService.softDelete(id, user.id); }

  @Get(":id/download/:kind") async download(@Param("id") id: string, @Param("kind") kind: "draft" | "final", @Res() res: Response) {
    const result = await this.lettersService.download(id, kind);
    res.download(result.full, result.name);
  }
}
