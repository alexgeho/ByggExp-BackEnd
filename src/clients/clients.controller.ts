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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllAccessible(@Request() req) {
    return this.clientsService.findAccessible(req.user);
  }

  @Get('next-number')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  getNextCustomerNumber(@Request() req, @Query('companyId') companyId?: string) {
    return this.clientsService.getNextCustomerNumberForUser(req.user, companyId);
  }

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  create(@Request() req, @Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto, req.user);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findOne(@Request() req, @Param('id') id: string) {
    return this.clientsService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  remove(@Request() req, @Param('id') id: string) {
    return this.clientsService.remove(id, req.user);
  }
}
