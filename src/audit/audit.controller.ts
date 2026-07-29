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

  // Company-scoped audit trail. Only the caller's own company is ever returned.
  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  list(
    @Request() req,
    @Query() q: { entityType?: string; userId?: string; page?: string; pageSize?: string },
  ) {
    return this.audit.query(req.user.companyId, {
      entityType: q.entityType,
      userId: q.userId,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    });
  }
}
