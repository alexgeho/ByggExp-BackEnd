import {
  BadRequestException,
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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserRole } from './schemas/user.schema';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

const userAvatarStorage = diskStorage({
  destination: './uploads/user-avatars',
  filename: (_req, file, callback) => {
    const safeBaseName = file.originalname
      .replace(extname(file.originalname), '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || 'avatar';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

const userDocumentsStorage = diskStorage({
  destination: './uploads/user-documents',
  filename: (_req, file, callback) => {
    const safeBaseName = file.originalname
      .replace(extname(file.originalname), '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 80) || 'document';

    callback(null, `${Date.now()}-${safeBaseName}${extname(file.originalname)}`);
  },
});

type UploadedAvatarFile = {
  filename: string;
};

type UploadedDocumentFile = {
  filename: string;
};

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

  @Post(':id/avatar')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  @UseInterceptors(FileInterceptor('avatar', { storage: userAvatarStorage }))
  uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: UploadedAvatarFile,
    @Request() req,
  ): Promise<User> {
    if (req.user.role !== UserRole.SuperAdmin && req.user.userId !== id) {
      throw new Error('Access denied');
    }

    return this.usersService.update(id, {
      avatarUrl: file ? `/uploads/user-avatars/${file.filename}` : '',
    });
  }

  @Post(':id/documents')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  @UseInterceptors(FilesInterceptor('documents', 4, { storage: userDocumentsStorage }))
  uploadAdditionalDocuments(
    @Param('id') id: string,
    @UploadedFiles() files: UploadedDocumentFile[],
    @Request() req,
  ): Promise<User> {
    if (req.user.role !== UserRole.SuperAdmin && req.user.userId !== id) {
      throw new Error('Access denied');
    }

    if (!files?.length) {
      throw new BadRequestException('No documents uploaded');
    }

    return this.usersService.appendAdditionalDocuments(
      id,
      files.map((file) => `/uploads/user-documents/${file.filename}`),
    );
  }

  @Delete(':id')
  @Roles(UserRole.SuperAdmin)
  remove(@Param('id') id: string): Promise<User> {
    return this.usersService.remove(id);
  }
}
