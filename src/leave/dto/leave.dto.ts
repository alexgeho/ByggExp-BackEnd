import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { LeaveStatus, LeaveType } from "../schemas/leave-request.schema";

export class CreateLeaveDto {
  // Admins may file on behalf of a worker; omitted = the caller themselves.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(Object.values(LeaveType))
  type?: LeaveType;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateLeaveDto {
  @IsOptional()
  @IsIn(Object.values(LeaveType))
  type?: LeaveType;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  halfDay?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewLeaveDto {
  @IsIn([LeaveStatus.Approved, LeaveStatus.Rejected, LeaveStatus.Pending])
  status: LeaveStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
