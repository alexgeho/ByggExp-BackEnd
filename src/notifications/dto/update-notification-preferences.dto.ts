import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  flowMode: boolean;

  @IsBoolean()
  messages: boolean;

  @IsBoolean()
  tasks: boolean;

  @IsBoolean()
  productAndMarketingAlerts: boolean;
}
