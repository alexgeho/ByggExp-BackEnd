import { IsOptional, IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters" })
  password: string;
}
