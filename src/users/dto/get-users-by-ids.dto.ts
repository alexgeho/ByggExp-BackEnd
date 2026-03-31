import { IsArray, IsString } from 'class-validator';

export class GetUsersByIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
