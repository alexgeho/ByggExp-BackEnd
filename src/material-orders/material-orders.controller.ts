import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { MaterialOrdersService } from "./material-orders.service";
import {
  CreateMaterialOrderDto,
  UpdateMaterialOrderDto,
  SetSupplierDiscountsDto,
  UpsertMaterialSupplierDto,
} from "./dto/material-order.dto";

const ALL = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
  UserRole.Worker,
];
const SENDERS = [
  UserRole.SuperAdmin,
  UserRole.CompanyAdmin,
  UserRole.ProjectAdmin,
];

@Controller("material-orders")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class MaterialOrdersController {
  constructor(private readonly service: MaterialOrdersService) {}

  @Get("articles")
  @Roles(...ALL)
  articles(
    @Request() req,
    @Query("supplier") supplier?: string,
    @Query("q") q?: string,
  ) {
    return this.service.searchArticles(req.user, supplier, q);
  }

  @Get("suppliers")
  @Roles(...ALL)
  suppliers(@Request() req) {
    return this.service.listSuppliers(req.user);
  }

  @Put("suppliers/:supplier")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  upsertSupplier(
    @Request() req,
    @Param("supplier") supplier: string,
    @Body() dto: UpsertMaterialSupplierDto,
  ) {
    return this.service.upsertSupplier(supplier, dto, req.user);
  }

  // Rabattbrev: replace the discounts and reprice the supplier's articles.
  @Put("suppliers/:supplier/discounts")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  setDiscounts(
    @Request() req,
    @Param("supplier") supplier: string,
    @Body() dto: SetSupplierDiscountsDto,
  ) {
    return this.service.setDiscounts(supplier, dto, req.user);
  }

  @Delete("suppliers/:supplier")
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  hideSupplier(@Request() req, @Param("supplier") supplier: string) {
    return this.service.hideSupplier(supplier, req.user);
  }

  // "Beställt material" for the project economy: { total, count, invoicedCount }.
  @Get("project/:projectId/summary")
  @Roles(...SENDERS)
  projectSummary(@Request() req, @Param("projectId") projectId: string) {
    return this.service.projectSummary(projectId, req.user);
  }

  @Get()
  @Roles(...ALL)
  findAll(@Request() req, @Query("projectId") projectId?: string) {
    return this.service.findAll(req.user, projectId);
  }

  @Post()
  @Roles(...ALL)
  create(@Request() req, @Body() dto: CreateMaterialOrderDto) {
    return this.service.create(dto, req.user);
  }

  @Get(":id")
  @Roles(...ALL)
  findOne(@Request() req, @Param("id") id: string) {
    return this.service.findOne(id, req.user);
  }

  @Put(":id")
  @Roles(...ALL)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() dto: UpdateMaterialOrderDto,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(":id")
  @Roles(...ALL)
  remove(@Request() req, @Param("id") id: string) {
    return this.service.remove(id, req.user);
  }

  @Post(":id/send")
  @Roles(...SENDERS)
  send(@Request() req, @Param("id") id: string) {
    return this.service.send(id, req.user);
  }
}
