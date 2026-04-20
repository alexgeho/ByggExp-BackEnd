import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserRole } from './schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async create(@Body() createUserDto: CreateUserDto, @Request() req): Promise<User> {
    // ProjectAdmin может создавать только Worker
    if (req.user.role === UserRole.ProjectAdmin && createUserDto.role !== UserRole.Worker) {
      createUserDto.role = UserRole.Worker;
    }

    // CompanyAdmin может создавать Worker и ProjectAdmin
    if (req.user.role === UserRole.CompanyAdmin) {
      // CompanyAdmin не может создавать SuperAdmin или другого CompanyAdmin
      if (
        createUserDto.role === UserRole.SuperAdmin ||
        createUserDto.role === UserRole.CompanyAdmin
      ) {
        createUserDto.role = UserRole.Worker;
      }
      // Добавляем companyId автоматически
      if (!createUserDto.companyId) {
        createUserDto.companyId = req.user.companyId;
      }
    }

    // Хешируем пароль перед сохранением
    const hashedPassword = await this.usersService.hashPassword(createUserDto.password);
    
    return this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
    });
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get('company/:companyId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  findAllByCompany(@Param('companyId') companyId: string): Promise<User[]> {
    return this.usersService.findAllByCompany(companyId);
  }

  @Get('my-company')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findAllByMyCompany(@Request() req): Promise<User[]> {
    if (req.user.role === UserRole.SuperAdmin && !req.user.companyId) {
      return this.usersService.findAll();
    }

    if (!req.user.companyId) {
      throw new Error('User is not associated with any company');
    }

    return this.usersService.findAllByCompany(req.user.companyId);
  }

  @Get('project/:projectId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findAllByProject(@Param('projectId') projectId: string): Promise<User[]> {
    return this.usersService.findAllByProject(projectId);
  }

  @Get('role/:role')
  @Roles(UserRole.SuperAdmin)
  findAllByRole(@Param('role') role: UserRole): Promise<User[]> {
    return this.usersService.findAllByRole(role);
  }

  @Get('by-email')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  findOneIdByEmail(@Query('email') email: string): Promise<{ id: string } | null> {
    return this.usersService.findOneIdByEmail(email);
  }

  @Get('info/:id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  async findUserById(@Param('id') id: string) {
    const user = await this.usersService.findUserById(id);
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  @Post('by-ids')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin)
  async findByIds(@Body() dto: { ids: string[] }) {
    const users = await this.usersService.findByIds(dto.ids);
    return users.map(user => ({
      id: (user as any)._id.toString(),
      email: user.email,
      name: user.name,
      profession: user.profession || '',
      role: user.role,
      companyId: user.companyId,
    }));
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Param('id') id: string, @Request() req): Promise<User> {
    // Пользователь может смотреть только свой профиль или профили в своей компании/проекте
    if (req.user.role === UserRole.Worker && req.user.userId !== id) {
      throw new Error('Access denied');
    }
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: Partial<CreateUserDto>,
    @Request() req,
  ): Promise<User> {
    // Пользователь может редактировать только свой профиль (кроме SuperAdmin)
    if (req.user.role !== UserRole.SuperAdmin && req.user.userId !== id) {
      throw new Error('Access denied');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin)
  remove(@Param('id') id: string): Promise<User> {
    return this.usersService.remove(id);
  }
}
