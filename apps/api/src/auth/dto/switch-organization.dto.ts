import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SwitchOrganizationDto {
  @ApiProperty()
  @IsString()
  organizationId: string;
}
