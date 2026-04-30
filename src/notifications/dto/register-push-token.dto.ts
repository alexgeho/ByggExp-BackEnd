import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DevicePlatform } from '../schemas/device-token.schema';

export class RegisterPushTokenDto {
  @IsString()
  expoPushToken: string;

  @IsString()
  installationId: string;

  @IsEnum(DevicePlatform)
  @IsOptional()
  platform?: DevicePlatform;

  @IsString()
  @IsOptional()
  appVersion?: string;
}
