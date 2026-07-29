import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { AuditService } from "./audit.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SECTION_PREFIXES = new Set(["admin", "company", "worker"]);

// Best-effort resource type + id from the URL, e.g. /company/invoices/<id>
// → { entityType: "invoices", entityId: "<id>" }.
function describe(
  path: string,
  params: Record<string, string> = {},
): { entityType: string | null; entityId: string | null } {
  const segments = (path || "").split("/").filter(Boolean);
  const meaningful =
    segments.length && SECTION_PREFIXES.has(segments[0])
      ? segments.slice(1)
      : segments;
  const entityType = meaningful[0] || null;
  const last = meaningful[meaningful.length - 1];
  const entityId =
    params.id ||
    params.workerId ||
    params.projectId ||
    params.userId ||
    (meaningful.length > 1 && /^[0-9a-fA-F]{8,}$/.test(last) ? last : null);
  return { entityType, entityId };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    // Only audit authenticated, state-changing requests.
    if (!MUTATING.has(method) || !req.user) return next.handle();

    const res = context.switchToHttp().getResponse();
    const { entityType, entityId } = describe(req.path || req.url, req.params);
    const base = {
      companyId: req.user.companyId ?? null,
      userId: req.user.userId ?? null,
      userEmail: req.user.email || "",
      userRole: req.user.role || "",
      method,
      path: (req.originalUrl || req.url || "").split("?")[0],
      entityType,
      entityId,
    };

    return next.handle().pipe(
      tap(() =>
        this.audit.record({
          ...base,
          statusCode: res.statusCode || 200,
          success: true,
        }),
      ),
      catchError((err) => {
        const statusCode =
          typeof err?.getStatus === "function"
            ? err.getStatus()
            : err?.status || 500;
        this.audit.record({ ...base, statusCode, success: statusCode < 400 });
        return throwError(() => err);
      }),
    );
  }
}
