import { ArrayNotEmpty, IsArray, IsOptional, IsString } from "class-validator";

export class CreateGroupChatDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  memberIds: string[];

  @IsString()
  @IsOptional()
  title?: string;
}
