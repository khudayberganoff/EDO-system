import { ArrayMinSize, IsArray, IsEnum, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { WorkflowType } from "../../common/enums";

export class CreateWorkflowDto {
  @ApiProperty({ enum: WorkflowType, example: WorkflowType.SEQUENTIAL })
  @IsEnum(WorkflowType)
  type: WorkflowType;

  @ApiProperty({
    description: "Tasdiqlovchilar ID'lari tartib bo'yicha (SEQUENTIAL uchun tartib muhim)",
    example: ["user-id-1", "user-id-2"],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "Kamida bitta tasdiqlovchi kerak." })
  @IsString({ each: true })
  approverIds: string[];
}
