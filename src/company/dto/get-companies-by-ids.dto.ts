import { IsArray, IsString } from 'class-validator';

export class GetCompaniesByIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
