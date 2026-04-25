import { IsNotEmpty, IsString } from 'class-validator';

export class StartShiftDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
