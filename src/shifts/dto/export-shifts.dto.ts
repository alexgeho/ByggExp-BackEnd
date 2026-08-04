import { IsIn, IsOptional } from "class-validator";
import { ListShiftsDto } from "./list-shifts.dto";

export type HoursSource = "planned" | "gps" | "manual";
export const HOURS_SOURCES: HoursSource[] = ["planned", "gps", "manual"];

export class ExportShiftsDto extends ListShiftsDto {
  @IsOptional()
  @IsIn(["pdf", "excel"], { message: "format must be either pdf or excel" })
  format?: "pdf" | "excel";

  // Which hours source the report should bill on. Defaults to GPS (measured).
  @IsOptional()
  @IsIn(HOURS_SOURCES, {
    message: "hoursSource must be one of planned, gps or manual",
  })
  hoursSource?: HoursSource;
}
