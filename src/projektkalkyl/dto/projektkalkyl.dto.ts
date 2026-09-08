import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class KalkylRowDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["income", "cost"])
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class CreateProjektkalkylDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsIn(["ex", "inkl"])
  momsMode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KalkylRowDto)
  rows?: KalkylRowDto[];
}

export class UpdateProjektkalkylDto extends CreateProjektkalkylDto {}
