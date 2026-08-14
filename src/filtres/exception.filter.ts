import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

// Friendly Swedish labels for the fields that carry a unique index, so a
// duplicate-key error reads like a sentence instead of a raw driver dump.
const DUP_FIELD_LABELS: Record<string, string> = {
  email: "E-postadressen",
  personnummer: "Personnumret",
  invoiceNumber: "Fakturanumret",
  qrId: "QR-koden",
  orgNumber: "Organisationsnumret",
  supplierOrgNumber: "Organisationsnumret",
  name: "Namnet",
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  // Turn any thrown value into an HTTP status + a message a user can act on.
  private resolve(exception: any): { status: number; message: string } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const raw =
        typeof res === "string"
          ? res
          : (res as { message?: unknown })?.message || exception.message;
      return {
        status: exception.getStatus(),
        message: Array.isArray(raw) ? raw.join(", ") : String(raw),
      };
    }

    // Mongo duplicate key (unique index violation).
    if (exception?.code === 11000) {
      const field = Object.keys(
        exception.keyValue || exception.keyPattern || {},
      )[0];
      const label = DUP_FIELD_LABELS[field] || field || "Värdet";
      return {
        status: HttpStatus.CONFLICT,
        message: `${label} används redan.`,
      };
    }

    // Mongoose schema validation.
    if (exception?.name === "ValidationError" && exception.errors) {
      const fields = Object.keys(exception.errors).join(", ");
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Ogiltiga uppgifter${fields ? ` (${fields})` : ""}.`,
      };
    }

    // Malformed id / value that couldn't be cast to the schema type.
    if (exception?.name === "CastError") {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Ogiltigt värde för "${exception.path}".`,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Ett oväntat fel inträffade. Försök igen.",
    };
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, message } = this.resolve(exception);

    this.logger.error(
      `Status: ${status} | Message: ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // TEMP DIAGNOSTIC (remove after): on unexpected 500s, echo the real error +
    // stack in the response so we can pin down the password-reset failure
    // without server log access.
    const diag =
      status === HttpStatus.INTERNAL_SERVER_ERROR
        ? {
            _diag: {
              name: (exception as any)?.name ?? null,
              raw: String((exception as any)?.message ?? exception),
              stack: String((exception as any)?.stack ?? "")
                .split("\n")
                .slice(0, 8),
            },
          }
        : {};

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      ...diag,
    });
  }
}
