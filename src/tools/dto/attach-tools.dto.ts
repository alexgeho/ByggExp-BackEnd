import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AttachToolsToWorkerDto {
  @IsString()
  @IsNotEmpty()
  workerId: string;

  @IsArray()
  @IsString({ each: true })
  toolIds: string[];
}

export class AttachToolsToProjectDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsArray()
  @IsString({ each: true })
  toolIds: string[];
}
