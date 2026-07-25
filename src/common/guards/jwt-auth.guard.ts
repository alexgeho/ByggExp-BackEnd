import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global JWT authentication guard: every route requires a valid token by
 * default, unless it (or its controller) is marked with @Public(). This makes
 * new endpoints authenticated-by-default instead of accidentally public when a
 * developer forgets to add @UseGuards.
 *
 * Authorization (roles / tenant scope) is still enforced per-controller by
 * RolesGuard and the service-level assertCanAccess checks.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
