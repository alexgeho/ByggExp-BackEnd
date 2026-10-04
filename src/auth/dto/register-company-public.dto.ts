import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
  IsObject,
} from "class-validator";

// Minimal-friction sign-up: just a name (person or company) + email. The user
// chooses a password later, on the page opened from the confirmation link.
export class RegisterCompanyPublicDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Optional separate person name; defaults to companyName when omitted.
  @IsOptional()
  @IsString()
  userName?: string;

  // Self-serve plan picked on the landing page; only the solo tier for now.
  // Absent = regular trial with every module.
  @IsOptional()
  @IsIn(["egenkontroll"])
  plan?: "egenkontroll";

  // Where the visitor came from (UTM tags, referrer, landing page) — see
  // auth/signup-source.ts. Sanitised server-side.
  @IsOptional()
  @IsObject()
  source?: Record<string, unknown>;
}
