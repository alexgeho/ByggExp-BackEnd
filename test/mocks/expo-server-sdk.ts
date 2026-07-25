/**
 * Test stub for the ESM-only `expo-server-sdk` package so the AppModule can be
 * booted under jest without transforming node_modules. Push notifications are
 * not exercised by the isolation e2e tests, so every method is a no-op.
 */
export class Expo {
  constructor(_options?: unknown) {}
  static isExpoPushToken(_token: unknown): boolean {
    return false;
  }
  chunkPushNotifications(_messages: unknown[]): unknown[] {
    return [];
  }
  chunkPushNotificationReceiptIds(_ids: unknown[]): unknown[] {
    return [];
  }
  async sendPushNotificationsAsync(_chunk: unknown): Promise<unknown[]> {
    return [];
  }
  async getPushNotificationReceiptsAsync(_chunk: unknown): Promise<unknown> {
    return {};
  }
}

export type ExpoPushMessage = Record<string, unknown>;
export type ExpoPushReceipt = Record<string, unknown>;
