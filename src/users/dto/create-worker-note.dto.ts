import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateWorkerNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
