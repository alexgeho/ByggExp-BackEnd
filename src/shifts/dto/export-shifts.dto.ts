import { IsIn, IsOptional } from 'class-validator';
import { ListShiftsDto } from './list-shifts.dto';

export class ExportShiftsDto extends ListShiftsDto {
  @IsOptional()
  @IsIn(['pdf', 'excel'], { message: 'format must be either pdf or excel' })
  format?: 'pdf' | 'excel';
}
