import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProjectGroupChatDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsOptional()
  title?: string;
}
