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
import { Permissions } from "../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { PERMISSIONS } from "../common/permissions/permissions.constants";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

@Controller("clients")
@UseGuards(AuthGuard("jwt"), PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findAllAccessible(@Request() req) {
    return this.clientsService.findAccessible(req.user);
  }

  @Get("next-number")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  getNextCustomerNumber(
    @Request() req,
    @Query("companyId") companyId?: string,
  ) {
    return this.clientsService.getNextCustomerNumberForUser(
      req.user,
      companyId,
    );
  }

  @Post()
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  create(@Request() req, @Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto, req.user);
  }

  @Get(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  findOne(@Request() req, @Param("id") id: string) {
    return this.clientsService.findOne(id, req.user);
  }

  @Put(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  update(
    @Request() req,
    @Param("id") id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto, req.user);
  }

  @Delete(":id")
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  remove(@Request() req, @Param("id") id: string) {
    return this.clientsService.remove(id, req.user);
  }
}
