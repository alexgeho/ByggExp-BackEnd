import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDirectChatDto {
  @IsString()
  @IsNotEmpty()
  participantId: string;
}
