import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Expo, ExpoPushMessage, ExpoPushReceipt } from 'expo-server-sdk';
import { Model } from 'mongoose';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import {
  DevicePlatform,
  DeviceToken,
  DeviceTokenDocument,
} from './schemas/device-token.schema';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
  ) {}

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

  async sendToUsers(userIds: string[], payload: PushPayload) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueUserIds.length) {
      return { attempted: 0, sent: 0, disabledTokens: 0 };
    }

    const deviceTokens = await this.deviceTokenModel.find({
      userId: { $in: uniqueUserIds },
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
}
