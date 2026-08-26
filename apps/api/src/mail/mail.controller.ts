import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { MailService } from "./mail.service";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../common/enums";

@ApiTags("Kiruvchi pochta")
@ApiBearerAuth()
@Controller("mail")
export class MailController {
  constructor(private mailService: MailService) {}

  // --- Pochta qutilari ---

  @Get("accounts")
  listAccounts() {
    return this.mailService.listAccounts();
  }

  @Post("accounts")
  @Roles(Role.ADMIN, Role.MANAGER)
  createAccount(@Body() body: any) {
    return this.mailService.createAccount(body);
  }

  @Patch("accounts/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateAccount(@Param("id") id: string, @Body() body: any) {
    return this.mailService.updateAccount(id, body);
  }

  @Delete("accounts/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeAccount(@Param("id") id: string) {
    return this.mailService.removeAccount(id);
  }

  @Post("accounts/:id/test")
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: "Ulanishni tekshirish" })
  test(@Param("id") id: string) {
    return this.mailService.testConnection(id);
  }

  @Post("accounts/:id/sync")
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: "Yangi xatlarni olib kelish" })
  sync(@Param("id") id: string) {
    return this.mailService.syncAccount(id);
  }

  // --- Kiruvchi xatlar ---

  @Get("inbox")
  inbox(@Query("accountId") accountId?: string, @Query("unread") unread?: string) {
    return this.mailService.listMails({ accountId, unreadOnly: unread === "true" });
  }

  @Get("inbox/:id")
  @ApiOperation({ summary: "Xatning to'liq matni va ilovalari" })
  fullMail(@Param("id") id: string) {
    return this.mailService.loadFullMail(id);
  }

  @Get("attachments/:id")
  @ApiOperation({ summary: "Biriktirilgan faylni yuklab olish" })
  async downloadAttachment(@Param("id") id: string, @Res() res: Response) {
    const { full, name, mimeType } = await this.mailService.getAttachment(id);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    res.sendFile(full);
  }

  @Patch("inbox/:id/read")
  markRead(@Param("id") id: string, @Body() body: { isRead: boolean }) {
    return this.mailService.markRead(id, body?.isRead ?? true);
  }

  @Delete("inbox/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeMail(@Param("id") id: string) {
    return this.mailService.removeMail(id);
  }
}
