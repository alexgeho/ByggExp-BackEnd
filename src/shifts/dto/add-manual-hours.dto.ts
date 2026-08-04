import { IsInt, IsNotEmpty, IsString, Matches, Max, Min } from "class-validator";

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
}
