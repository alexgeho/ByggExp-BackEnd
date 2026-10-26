import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  flowMode: boolean;

  @IsBoolean()
  messages: boolean;

  @IsBoolean()
  tasks: boolean;

  @IsBoolean()
  productAndMarketingAlerts: boolean;

  // Optional: apps before 1.1.5 don't send it — the stored value is kept.
  @IsOptional()
  @IsBoolean()
  invoices?: boolean;

  @IsOptional()
  @IsBoolean()
  materialOrders?: boolean;
}
