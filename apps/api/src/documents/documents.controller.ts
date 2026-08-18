import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DocumentStatus } from "../common/enums";
import { DocumentsService } from "./documents.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { documentFileUploadOptions } from "./multer.config";

@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: "Yangi hujjat (DRAFT holatida) yaratish" })
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: "Hujjatlar ro'yxati (filter va sahifalash bilan)" })
  findAll(
    @Query("status") status?: DocumentStatus,
    @Query("contractRefId") contractRefId?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("pageSize", new DefaultValuePipe(20), ParseIntPipe) pageSize = 20,
  ) {
    return this.documentsService.findAll({ status, contractRefId, page, pageSize });
  }

  @Get(":id")
  @ApiOperation({ summary: "Bitta hujjatni to'liq ma'lumot bilan olish (versiyalar, workflow)" })
  findOne(@Param("id") id: string) {
    return this.documentsService.findOne(id);
  }

  @Post(":id/versions")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Hujjatga yangi fayl versiyasini yuklash" })
  @UseInterceptors(FileInterceptor("file", documentFileUploadOptions))
  addVersion(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("note") note: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException("Fayl yuklanmadi.");
    }

    return this.documentsService.addVersion(
      id,
      {
        fileUrl: `/uploads/documents/${file.filename}`,
        fileName: file.originalname,
        fileSizeBytes: file.size,
      },
      user.id,
      note,
    );
  }

  @Post(":id/workflow")
  @ApiOperation({ summary: "Hujjat uchun tasdiqlash zanjirini (workflow) yaratish va IN_REVIEW ga o'tkazish" })
  createWorkflow(
    @Param("id") id: string,
    @Body() dto: CreateWorkflowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.createWorkflow(id, dto, user.id);
  }

  @Post("workflow-steps/:stepId/approve")
  @ApiOperation({ summary: "Workflow bosqichini tasdiqlash" })
  approveStep(
    @Param("stepId") stepId: string,
    @Body("comment") comment: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.decideStep(stepId, true, user.id, comment);
  }

  @Post("workflow-steps/:stepId/reject")
  @ApiOperation({ summary: "Workflow bosqichini rad etish" })
  rejectStep(
    @Param("stepId") stepId: string,
    @Body("comment") comment: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.decideStep(stepId, false, user.id, comment);
  }

  @Post(":id/archive")
  @ApiOperation({ summary: "Imzolangan hujjatni arxivlash" })
  archive(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.transitionStatus(id, DocumentStatus.ARCHIVED, user.id);
  }
}
