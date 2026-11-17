import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { AuditService } from "./audit.service";

@Controller("audit-logs")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  // Company-scoped audit trail: only the caller's own company is returned.
  // A superadmin may ask for another company (`companyId`) or for every company
  // (`scope=all`) — the support view: what happened to this customer.
  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  list(
    @Request() req,
    @Query()
    q: {
      entityType?: string;
      userId?: string;
      email?: string;
      failed?: string;
      companyId?: string;
      scope?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const superadmin = req.user.role === UserRole.SuperAdmin;
    const companyId =
      superadmin && q.companyId
        ? q.companyId
        : superadmin && q.scope === "all"
          ? null
          : req.user.companyId;
    return this.audit.query(companyId, {
      entityType: q.entityType,
      userId: q.userId,
      email: superadmin ? q.email : undefined,
      failed: q.failed === "1" || q.failed === "true",
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
  }
}
