import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Expo, ExpoPushMessage, ExpoPushReceipt } from 'expo-server-sdk';
import { Model } from 'mongoose';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import {
  DevicePlatform,
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';
import {
  normalizeUserNotificationPreferences,
  User,
  UserDocument,
  UserNotificationPreferences,
} from '../users/schemas/user.schema';

export type NotificationPreferenceKey = keyof UserNotificationPreferences;

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  preferenceKey?: NotificationPreferenceKey;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expo = process.env.EXPO_ACCESS_TOKEN
    ? new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN })
    : new Expo();

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getUserPreferences(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('notificationPreferences')
      .lean()
      .exec();

    return normalizeUserNotificationPreferences(user?.notificationPreferences);
  }

  async updateUserPreferences(
    userId: string,
    preferences: UserNotificationPreferences,
  ) {
    const normalizedPreferences = normalizeUserNotificationPreferences(preferences);

    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        { notificationPreferences: normalizedPreferences },
        { new: false },
      )
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    return normalizedPreferences;
  }

  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    if (!Expo.isExpoPushToken(dto.expoPushToken)) {
      throw new BadRequestException('Invalid Expo push token');
    }

    const token = await this.deviceTokenModel.findOneAndUpdate(
      { installationId: dto.installationId },
      {
        userId,
        expoPushToken: dto.expoPushToken,
        installationId: dto.installationId,
        platform: dto.platform ?? DevicePlatform.Unknown,
        appVersion: dto.appVersion,
        enabled: true,
        lastSeenAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).exec();

    return {
      id: token._id.toString(),
      installationId: token.installationId,
      enabled: token.enabled,
    };
  }

  async disablePushToken(userId: string, installationId: string) {
    const token = await this.deviceTokenModel.findOneAndUpdate(
      { userId, installationId },
      {
        enabled: false,
        lastSeenAt: new Date(),
      },
      { new: true },
    ).exec();

    return {
      disabled: Boolean(token),
      installationId,
    };
  }

  async sendTestNotification(
    userId: string,
    options: {
      title?: string;
      body?: string;
      type?: string;
      screen?: string;
      projectId?: string;
      entityId?: string;
    } = {},
  ) {
    return this.sendToUsers([userId], {
      title: options.title ?? 'ByggExp test',
      body: options.body ?? 'Push notifications are configured correctly.',
      data: {
        type: options.type ?? 'test',
        screen: options.screen ?? 'Menu',
        projectId: options.projectId,
        entityId: options.entityId,
      },
    });
  }

  async sendShiftOutsideProjectAreaNotification(
    userId: string,
    options: {
      shiftId: string;
      projectId?: string;
      projectName?: string;
    },
  ) {
    return this.sendToUsers([userId], {
      title: 'You are outside the project area',
      body: options.projectName
        ? `Your shift for ${options.projectName} was ended because you left the project area.`
        : 'Your shift was ended because you left the project area.',
      preferenceKey: 'flowMode',
      data: {
        type: 'shift_outside_project_area',
        screen: 'Shifts',
        entityId: options.shiftId,
        projectId: options.projectId,
        shiftId: options.shiftId,
      },
    });
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueUserIds.length) {
      return { attempted: 0, sent: 0, disabledTokens: 0 };
    }

    const preferenceKey =
      payload.preferenceKey ?? this.inferPreferenceKey(payload.data?.type);
    const allowedUserIds = await this.filterUsersByPreference(uniqueUserIds, preferenceKey);

    if (!allowedUserIds.length) {
      return { attempted: 0, sent: 0, disabledTokens: 0 };
    }

    const deviceTokens = await this.deviceTokenModel.find({
      userId: { $in: allowedUserIds },
      enabled: true,
    }).exec();

    if (!deviceTokens.length) {
      return { attempted: 0, sent: 0, disabledTokens: 0 };
    }

    const invalidTokenValues = deviceTokens
      .filter((token) => !Expo.isExpoPushToken(token.expoPushToken))
      .map((token) => token.expoPushToken);

    if (invalidTokenValues.length) {
      await this.disablePushTokens(invalidTokenValues);
    }

    const messages: ExpoPushMessage[] = deviceTokens
      .filter((token) => Expo.isExpoPushToken(token.expoPushToken))
      .map((token) => ({
        to: token.expoPushToken,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        priority: 'high',
        channelId: 'default',
      }));

    if (!messages.length) {
      return {
        attempted: 0,
        sent: 0,
        disabledTokens: invalidTokenValues.length,
      };
    }

    const receiptIds: string[] = [];
    const tokensToDisable = [...invalidTokenValues];

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);

        tickets.forEach((ticket, index) => {
          const pushToken = typeof chunk[index]?.to === 'string' ? chunk[index].to : null;

          if (ticket.status === 'ok' && ticket.id) {
            receiptIds.push(ticket.id);
            return;
          }

          if (ticket.status === 'error') {
            this.logger.warn(
              `Expo push ticket error for token ${pushToken ?? 'unknown'}: ${ticket.message}`,
            );

            if (ticket.details?.error === 'DeviceNotRegistered' && pushToken) {
              tokensToDisable.push(pushToken);
            }
          }
        });
      } catch (error) {
        this.logger.error('Failed to send Expo push notification chunk', error);
      }
    }

    if (receiptIds.length) {
      const receiptDisabledTokens = await this.processReceipts(receiptIds);
      tokensToDisable.push(...receiptDisabledTokens);
    }

    if (tokensToDisable.length) {
      await this.disablePushTokens(tokensToDisable);
    }

    return {
      attempted: messages.length,
      sent: receiptIds.length,
      disabledTokens: [...new Set(tokensToDisable)].length,
    };
  }

  private async processReceipts(receiptIds: string[]) {
    const tokensToDisable: string[] = [];

    for (const chunk of this.expo.chunkPushNotificationReceiptIds(receiptIds)) {
      try {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);

        Object.values(receipts).forEach((receipt) => {
          const typedReceipt = receipt as ExpoPushReceipt;
          if (typedReceipt.status !== 'error') {
            return;
          }

          const receiptToken = (typedReceipt.details as { expoPushToken?: string } | undefined)?.expoPushToken;
          this.logger.warn(
            `Expo push receipt error for token ${receiptToken ?? 'unknown'}: ${typedReceipt.message}`,
          );

          if (typedReceipt.details?.error === 'DeviceNotRegistered' && receiptToken) {
            tokensToDisable.push(receiptToken);
          }
        });
      } catch (error) {
        this.logger.error('Failed to fetch Expo push receipts', error);
      }
    }

    return tokensToDisable;
  }

  private async disablePushTokens(expoPushTokens: string[]) {
    const uniqueTokens = [...new Set(expoPushTokens.filter(Boolean))];
    if (!uniqueTokens.length) {
      return;
    }

    await this.deviceTokenModel.updateMany(
      { expoPushToken: { $in: uniqueTokens } },
      {
        enabled: false,
        lastSeenAt: new Date(),
      },
    ).exec();
  }

  private inferPreferenceKey(type?: unknown): NotificationPreferenceKey | undefined {
    if (typeof type !== 'string') {
      return undefined;
    }

    if (type.startsWith('task_')) {
      return 'tasks';
    }

    if (type.startsWith('message_') || type === 'chat_message') {
      return 'messages';
    }

    if (
      type.startsWith('marketing_')
      || type.startsWith('product_')
      || type === 'product_marketing_alert'
    ) {
      return 'productAndMarketingAlerts';
    }

    if (
      type === 'shift_outside_project_area'
      || type === 'flow_mode'
      || type === 'app_flow_alert'
    ) {
      return 'flowMode';
    }

    return undefined;
  }

  private async filterUsersByPreference(
    userIds: string[],
    preferenceKey?: NotificationPreferenceKey,
  ) {
    if (!preferenceKey) {
      return userIds;
    }

    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id notificationPreferences')
      .lean()
      .exec();

    return users
      .filter((user) => normalizeUserNotificationPreferences(user.notificationPreferences)[preferenceKey])
      .map((user) => user._id.toString());
  }
}
