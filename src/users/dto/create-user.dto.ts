import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsObject,
  IsBoolean,
  ValidateIf,
  IsIn,
  Min,
  Max,
} from "class-validator";
import { Transform } from "class-transformer";
import { UserRole } from "../schemas/user.schema";

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ValidateIf((dto) => !dto.inviteViaEmail)
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password?: string;

  @IsOptional()
  @IsBoolean()
  inviteViaEmail?: boolean;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  profession?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return typeof value === "string"
      ? parseFloat(value.replace(",", "."))
      : value;
  })
  @IsNumber()
  @IsOptional()
  hourlyRate?: number;

  @IsNumber()
  @IsOptional()
  taxTable?: number;

  @IsNumber()
  @IsOptional()
  taxColumn?: number;

  @IsIn(["yrkesarbetare", "ny_i_branschen", "larling", "ovriga_1", "other"])
  @IsOptional()
  wageCategory?: string | null;

  @IsString()
  @IsOptional()
  payrollEmployeeId?: string;

  @IsString()
  @IsOptional()
  personalNumber?: string;

  @IsString()
  @IsOptional()
  carRegNumber?: string;

  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  carCo2GPerKm?: number | null;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return typeof value === "string"
      ? parseInt(value.replace(/\D/g, ""), 10)
      : value;
  })
  @IsNumber()
  @IsOptional()
  phoneAreaCode?: number;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return typeof value === "string"
      ? parseInt(value.replace(/\D/g, ""), 10)
      : value;
  })
  @IsNumber()
  @IsOptional()
  phoneNumber?: number;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.Worker;

  @IsString()
  @IsOptional()
  companyId?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectIds?: string[];

  @IsObject()
  @IsOptional()
  language?: Record<string, any>;

  // Manager "needs attention" reminder settings (validated/normalized in the
  // service). lastSentAt is server-managed and preserved on update.
  @IsObject()
  @IsOptional()
  reminderSummary?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalDocuments?: string[];

  // Subcontractor firm the person comes from; null / empty = own staff.
  @IsOptional()
  @IsString()
  subcontractorId?: string | null;
}
