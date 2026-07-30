import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { GdprService } from "./gdpr.service";

@Controller("gdpr")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  @Get("users/:id/export")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  export(@Request() req, @Param("id") id: string) {
    return this.gdprService.export(id, req.user);
  }

  @Post("users/:id/erase")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  erase(@Request() req, @Param("id") id: string) {
    return this.gdprService.erase(id, req.user);
  }
}
