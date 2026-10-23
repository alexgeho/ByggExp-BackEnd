import {
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

// An admin records the hours a worker actually worked on a given day/project
// (the "Manual" hours source) — used when the worker forgot to clock in on the
// app or their hours need to be entered by hand. Duration is in milliseconds,
// capped at 24h so a typo can't bill an impossible day.
export class AddManualHoursDto {
  @IsString()
  @IsNotEmpty()
  workerId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  // Calendar day the hours apply to (YYYY-MM-DD).
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
  date: string;

  @IsInt({ message: "durationMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "durationMs cannot exceed 24 hours" })
  durationMs: number;

  // The part of durationMs that is övertid. Left out, the day keeps the split
  // it had (trimmed to the new hours) — older apps never send it.
  @IsInt({ message: "overtimeMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "overtimeMs cannot exceed 24 hours" })
  @IsOptional()
  overtimeMs?: number;

  // OB hours inside the day (part of durationMs, never overlapping övertid).
  // Left out, the day keeps the OB it had.
  @IsInt({ message: "obMs must be an integer number of milliseconds" })
  @Min(0)
  @Max(24 * 60 * 60 * 1000, { message: "obMs cannot exceed 24 hours" })
  @IsOptional()
  obMs?: number;

  // Restid, Bil and Traktamente from the day card — same fields as Dagens
  // rapport. Left out, the day keeps what it had.
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @IsOptional()
  travelMinutes?: number;

  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  travelKm?: number;

  @IsIn(["none", "half", "full"])
  @IsOptional()
  perDiem?: string;
}
