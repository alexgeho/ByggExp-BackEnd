import { IsIn, IsOptional } from "class-validator";
import { ListShiftsDto } from "./list-shifts.dto";

export type HoursSource = "planned" | "gps" | "manual";
export const HOURS_SOURCES: HoursSource[] = ["planned", "gps", "manual"];

export class ExportShiftsDto extends ListShiftsDto {
  @IsOptional()
  @IsIn(["pdf", "excel", "tidsunderlag"], {
    message: "format must be pdf, excel or tidsunderlag",
  })
  format?: "pdf" | "excel" | "tidsunderlag";

  // Which hours source the report should bill on. Defaults to GPS (measured).
  @IsOptional()
  @IsIn(HOURS_SOURCES, {
    message: "hoursSource must be one of planned, gps or manual",
  })
  hoursSource?: HoursSource;
}
