import { IsBoolean } from "class-validator";

// A manager's answer to a day's övertid: approved pays it as overtime, denied
// turns those hours into normal hours (they are still paid, without the
// overtime supplement).
export class OvertimeDecisionDto {
  @IsBoolean()
  approved: boolean;
}
