import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateBy,
  ValidateIf,
} from "class-validator";
import { isValidKontonummer, KID_MODES } from "../../invoices/norway";

export class CreateCompanyDto {
  // Only email is required — it becomes the login of the company's first admin.
  // Everything else is optional and can be filled in later by the company.
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  orgNumber?: string;

  @IsString()
  @IsOptional()
  vatNumber?: string;

  @IsString()
  @IsOptional()
  vatStatus?: string;

  // Bankgiro number shown on invoices and encoded into the payment QR code.
  @IsString()
  @IsOptional()
  bankgiro?: string;

  // Plusgiro number (alternative to Bankgiro).
  @IsString()
  @IsOptional()
  plusgiro?: string;

  // Bank account number (clearing + account).
  @IsString()
  @IsOptional()
  bankAccount?: string;

  // ISO country code of the company's home market (e.g. "SE", "NO").
  @IsString()
  @IsOptional()
  country?: string;

  // Language of the invited admin (e.g. "sv", "no", "en"). Drives the invite
  // email and becomes the admin's own language on acceptance. Not stored on the
  // company itself.
  @IsString()
  @IsOptional()
  language?: string;

  // ISO 4217 currency the company invoices in (e.g. "SEK", "NOK").
  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  // Norway: bank account (11 digits, MOD11). Empty clears it.
  @IsOptional()
  @ValidateIf((_, v) => v !== "")
  @ValidateBy({
    name: "isKontonummer",
    validator: {
      validate: (v) => typeof v === "string" && isValidKontonummer(v),
      defaultMessage: () =>
        "kontonummer must be 11 digits with a valid MOD11 check digit",
    },
  })
  kontonummer?: string;

  @IsOptional()
  @IsIn(KID_MODES)
  kidMode?: string;

  @IsOptional()
  @IsBoolean()
  mvaRegistered?: boolean;

  @IsOptional()
  @IsBoolean()
  foretaksregisteret?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  companyAdmins?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projects?: string[];
}
