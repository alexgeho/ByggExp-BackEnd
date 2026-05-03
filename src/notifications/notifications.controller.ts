import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { UserActivityLogLevel } from '../users/schemas/user-activity-log.schema';
import { UsersService } from '../users/users.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { SendTestNotificationDto } from './dto/send-test-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

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

  @Post('users/:userId/test')
  @Roles(UserRole.SuperAdmin, UserRole.CompanyAdmin)
  async sendUserTestNotification(
    @Request() req,
    @Param('userId') userId: string,
    @Body() dto: SendTestNotificationDto,
  ) {
    const targetUser = await this.usersService.findOne(userId);

    if (req.user.role === UserRole.CompanyAdmin && req.user.companyId !== targetUser.companyId) {
      throw new ForbiddenException('Access denied');
    }

    try {
      const result = await this.notificationsService.sendTestNotification(userId, {
        type: dto.type ?? 'admin_test',
        screen: dto.screen ?? 'Menu',
        projectId: dto.projectId,
        entityId: dto.entityId,
        title: dto.title ?? 'ByggExp admin test',
        body: dto.body ?? 'Test push sent from the admin panel.',
      });

      await this.usersService.logActivity(userId, {
        category: 'notifications',
        type: 'admin_test_push_sent',
        level: UserActivityLogLevel.Info,
        message: 'A test push notification was sent from the admin panel.',
        source: 'admin',
        details: {
          requestedByUserId: req.user.userId,
          requestedByRole: req.user.role,
          result,
        },
      });

      return result;
    } catch (error) {
      await this.usersService.logActivity(userId, {
        category: 'notifications',
        type: 'admin_test_push_failed',
        level: UserActivityLogLevel.Error,
        message: 'A test push notification from the admin panel failed.',
        source: 'admin',
        details: {
          requestedByUserId: req.user.userId,
          requestedByRole: req.user.role,
          errorMessage: error?.message || 'Unknown error',
        },
      });
      throw error;
    }
  }
}
