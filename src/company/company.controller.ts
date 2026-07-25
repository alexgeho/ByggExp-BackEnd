import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { RegisterCompanyWithAdminDto } from './dto/register-company-with-admin.dto';
import { Company } from './schemas/company.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../users/schemas/user.schema';

@Controller('company')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post('register')
  @Roles(UserRole.SuperAdmin)
  async registerCompanyWithAdmin(
    @Body() dto: RegisterCompanyWithAdminDto,
  ): Promise<{ company: Company; admin: any }> {
    return this.companyService.registerCompanyWithAdmin(dto);
  }

  @Post()
  @Roles(UserRole.SuperAdmin)
  create(@Body() createCompanyDto: CreateCompanyDto): Promise<Company> {
    return this.companyService.create(createCompanyDto);
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(): Promise<Company[]> {
    return this.companyService.findAll();
  }

  @Get('my')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOneByUser(@Request() req): Promise<Company> {
    if (!req.user.companyId) {
      throw new Error('User is not associated with any company');
    }
    return this.companyService.findOne(req.user.companyId);
  }

  // A non-superadmin may only ever look at their own company.
  private assertOwnCompany(id: string, req: { user: { role?: UserRole; companyId?: string | null } }) {
    if (
      req.user.role !== UserRole.SuperAdmin &&
      String(req.user.companyId) !== String(id)
    ) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  @Get('info/:id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async findCompanyById(@Param('id') id: string, @Request() req) {
    this.assertOwnCompany(id, req);
    const company = await this.companyService.findCompanyById(id);
    if (!company) {
      throw new NotFoundException(`Company with ID "${id}" not found`);
    }
    return company;
  }

  @Post('by-ids')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }, @Request() req) {
    // Non-superadmin can only ever resolve their own company.
    const ids =
      req.user.role === UserRole.SuperAdmin
        ? dto.ids
        : dto.ids.filter((id) => String(id) === String(req.user.companyId));
    const companies = await this.companyService.findByIds(ids);
    return companies.map(company => ({
      id: (company as any)._id.toString(),
      name: company.name,
      email: company.email,
      address: company.address,
    }));
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Param('id') id: string, @Request() req): Promise<Company> {
    this.assertOwnCompany(id, req);
    return this.companyService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  update(
    @Param('id') id: string,
    @Body() updateCompanyDto: Partial<CreateCompanyDto>,
    @Request() req,
  ): Promise<Company> {
    // CompanyAdmin может редактировать только свою компанию
    if (req.user.role === UserRole.CompanyAdmin && req.user.companyId !== id) {
      throw new Error('Access denied');
    }
    return this.companyService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin)
  remove(@Param('id') id: string): Promise<Company> {
    return this.companyService.remove(id);
  }
}
