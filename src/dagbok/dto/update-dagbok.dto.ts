import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateDagbokDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  weather?: string;

  @IsOptional()
  @IsString()
  temperature?: string;

  @IsOptional()
  @IsNumber()
  crewCount?: number;

  @IsOptional()
  @IsString()
  personnel?: string;

  @IsOptional()
  @IsString()
  workPerformed?: string;

  @IsOptional()
  @IsString()
  deviations?: string;

  @IsOptional()
  @IsString()
  materials?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}
