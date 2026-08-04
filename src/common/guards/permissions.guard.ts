import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { userHasPermission } from "../permissions/permissions.constants";

/**
 * Passes when the authenticated user has ALL required capabilities.
 * Effective capabilities are computed from the user's role defaults plus their
 * per-user granted/revoked overrides (see permissions.constants). Tenant
 * isolation (companyId) is enforced separately in the services — this only
 * gates the capability.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    const missing = required.filter((perm) => !userHasPermission(user, perm));

    if (missing.length) {
      throw new ForbiddenException(
        `Access denied. Missing permission(s): ${missing.join(", ")}`,
      );
    }

    return true;
  }
}
