import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { BillingService } from "./billing.service";
import { ACTIVE_STATUSES } from "./plans";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Paths a lapsed company must still reach (to pay) or that must never be gated.
const EXEMPT_PREFIXES = ["/billing", "/auth"];

// Soft paywall: when BILLING_ENFORCED=true and Stripe is configured, a company
// without an active/trialing/past_due subscription can still READ everything but
// cannot make changes — mutations return 402 with a clear message. Runs as an
// interceptor (after the auth guard) so req.user is available.
@Injectable()
export class SubscriptionInterceptor implements NestInterceptor {
  constructor(private readonly billing: BillingService) {}

  private enforced(): boolean {
    return process.env.BILLING_ENFORCED === "true" && this.billing.isEnabled();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http" || !this.enforced()) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || !req.user) {
      return next.handle();
    }
    if (req.user.role === "superadmin" || !req.user.companyId) {
      return next.handle();
    }
    const path: string = req.path || req.url || "";
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    return from(this.billing.getSubscriptionStatus(req.user.companyId)).pipe(
      switchMap((status) => {
        if (!status || !ACTIVE_STATUSES.has(status)) {
          throw new HttpException(
            "Prenumeration krävs — förnya för att fortsätta.",
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        return next.handle();
      }),
    );
  }
}
