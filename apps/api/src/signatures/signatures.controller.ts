import { Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SignaturesService } from "./signatures.service";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";

@ApiTags("signatures")
@ApiBearerAuth()
@Controller("documents")
export class SignaturesController {
  constructor(private signaturesService: SignaturesService) {}

  @Post(":id/sign")
  @ApiOperation({ summary: "Hujjatning oxirgi versiyasini elektron imzo bilan imzolash" })
  sign(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.signaturesService.signLatestVersion(id, user.id);
  }
}
