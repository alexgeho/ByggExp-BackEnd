import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateDirectChatDto } from './dto/create-direct-chat.dto';
import { CreateProjectGroupChatDto } from './dto/create-project-group-chat.dto';
import { ChatsService } from './chats.service';

@Controller('chats')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findAccessible(@Request() req) {
    return this.chatsService.findAccessible(req.user);
  }

  @Post('direct')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  getOrCreateDirect(@Request() req, @Body() createDirectChatDto: CreateDirectChatDto) {
    return this.chatsService.getOrCreateDirectChat(createDirectChatDto, req.user);
  }

  @Post('project-group')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  getOrCreateProjectGroup(@Request() req, @Body() createProjectGroupChatDto: CreateProjectGroupChatDto) {
    return this.chatsService.getOrCreateProjectGroupChat(createProjectGroupChatDto, req.user);
  }

  @Get(':id')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  findOne(@Request() req, @Param('id') id: string) {
    return this.chatsService.findOneAccessible(id, req.user);
  }
}