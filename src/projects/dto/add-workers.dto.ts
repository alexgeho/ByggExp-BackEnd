import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class AddWorkersToProjectDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  workerIds: string[];
}
