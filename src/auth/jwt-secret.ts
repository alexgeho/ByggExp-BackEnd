import { ConfigService } from "@nestjs/config";

/**
 * Returns the JWT signing secret from configuration, failing fast if it is not
 * set. Previously the code fell back to a hardcoded literal
 * ('SECRET_KEY_CHANGE_IN_PRODUCTION'); if JWT_SECRET was ever unset in an
 * environment, anyone could forge admin tokens. We now refuse to start rather
 * than run with a well-known secret.
 */
export function requireJwtSecret(configService: ConfigService): string {
  const secret =
    configService.get<string>("JWT_SECRET") ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable must be set (no insecure default is allowed)",
    );
  }
  return secret;
}
