import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendTestNotificationDto } from './dto/send-test-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('push-token')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  registerPushToken(@Request() req, @Body() dto: RegisterPushTokenDto) {
    return this.notificationsService.registerPushToken(req.user.userId, dto);
  }

  @Delete('push-token/:installationId')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  disablePushToken(@Request() req, @Param('installationId') installationId: string) {
    return this.notificationsService.disablePushToken(req.user.userId, installationId);
  }

  @Post('test')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin, UserRole.ProjectAdmin, UserRole.Worker)
  sendTestNotification(@Request() req, @Body() dto: SendTestNotificationDto) {
    return this.notificationsService.sendTestNotification(req.user.userId, {
      type: dto.type ?? 'test',
      screen: dto.screen ?? 'Menu',
      projectId: dto.projectId,
      entityId: dto.entityId,
      title: dto.title,
      body: dto.body,
    });
  }
}
