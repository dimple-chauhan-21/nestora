import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';

// Mock the SDK — these tests must never touch real FCM. `getMessaging()`'s
// return value is controlled per-test via the `send` jest.fn() below.
const mockSend = jest.fn();
jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'fake-app' })),
  cert: jest.fn((c: unknown) => c),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

import { FcmNotificationProvider } from './fcm-notification.provider';
import { DeviceToken } from '../../database/entities/device-token.entity';
import type { NotificationPayload } from './notification-provider.interface';

class FakeDeviceTokenRepo {
  rows: DeviceToken[] = [];

  createQueryBuilder() {
    const rows = this.rows;
    let userId: string | undefined;
    const qb = {
      where(sql: string, params?: Record<string, unknown>) {
        if (sql.includes('user_id')) userId = params?.userId as string;
        return qb;
      },
      andWhere(sql: string, params?: Record<string, unknown>) {
        if (sql.includes('user_id')) userId = params?.userId as string;
        return qb;
      },
      async getMany(): Promise<DeviceToken[]> {
        return rows.filter((r) => r.userId === userId && !r.deletedAt);
      },
    };
    return qb;
  }

  async update(id: string, partial: Partial<DeviceToken>): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, partial);
  }
}

function buildToken(userId: string, overrides: Partial<DeviceToken> = {}): DeviceToken {
  return {
    id: randomUUID(),
    userId,
    token: `fcm-token-${randomUUID()}`,
    platform: 'android',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildPayload(recipientUserId: string): NotificationPayload {
  return {
    recipientUserId,
    channel: 'push',
    event: 'test.event',
    title: 'Title',
    body: 'Body',
  };
}

describe('FcmNotificationProvider.send', () => {
  let deviceTokens: FakeDeviceTokenRepo;
  let provider: FcmNotificationProvider;

  beforeEach(() => {
    mockSend.mockReset();
    deviceTokens = new FakeDeviceTokenRepo();
    provider = new FcmNotificationProvider(
      { projectId: 'fake', clientEmail: 'fake@fake.iam.gserviceaccount.com', privateKey: 'fake-key' },
      deviceTokens as unknown as Repository<DeviceToken>,
    );
  });

  it('sends to every registered device token for the recipient', async () => {
    const userId = randomUUID();
    deviceTokens.rows.push(buildToken(userId), buildToken(userId));
    mockSend.mockResolvedValue('message-id');

    await provider.send(buildPayload(userId));

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does nothing (no throw, no send call) when the user has no registered device tokens', async () => {
    const userId = randomUUID();

    await expect(provider.send(buildPayload(userId))).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  /**
   * The concurrency-style test alone can't distinguish "prunes correctly"
   * from "does nothing" — this asserts the token is actually marked
   * deleted, not just that the call didn't throw.
   */
  it('prunes a dead token (messaging/registration-token-not-registered) and does not throw', async () => {
    const userId = randomUUID();
    const deadToken = buildToken(userId);
    deviceTokens.rows.push(deadToken);
    mockSend.mockRejectedValue(
      Object.assign(new Error('Requested entity was not found.'), {
        code: 'messaging/registration-token-not-registered',
      }),
    );

    await expect(provider.send(buildPayload(userId))).resolves.toBeUndefined();

    expect(deviceTokens.rows[0]?.deletedAt).not.toBeNull();
  });

  /**
   * The deliverable #5/#6 case this whole file exists to prove: a transient
   * provider failure (rate limit, quota, network blip — anything that
   * ISN'T "this token is permanently dead") must not throw into the
   * caller, must not be silently swallowed (it's logged — see the negative
   * check below via the pruning assertion), and must NOT be misread as a
   * dead token and pruned, since the token might still be good on retry.
   */
  it('logs a transient failure without throwing and without pruning the token', async () => {
    const userId = randomUUID();
    const goodToken = buildToken(userId);
    deviceTokens.rows.push(goodToken);
    mockSend.mockRejectedValue(Object.assign(new Error('Quota exceeded'), { code: 'messaging/quota-exceeded' }));

    await expect(provider.send(buildPayload(userId))).resolves.toBeUndefined();

    // Not pruned — this failure doesn't mean the token is invalid.
    expect(goodToken.deletedAt).toBeNull();
  });

  it('a completely unexpected error shape (no .code at all) still does not throw', async () => {
    const userId = randomUUID();
    deviceTokens.rows.push(buildToken(userId));
    mockSend.mockRejectedValue(new Error('ECONNRESET'));

    await expect(provider.send(buildPayload(userId))).resolves.toBeUndefined();
  });

  it('one dead token among several does not stop the others from being attempted', async () => {
    const userId = randomUUID();
    const dead = buildToken(userId);
    const good = buildToken(userId);
    deviceTokens.rows.push(dead, good);

    mockSend.mockImplementation(async (msg: { token: string }) => {
      if (msg.token === dead.token) {
        throw Object.assign(new Error('not registered'), { code: 'messaging/registration-token-not-registered' });
      }
      return 'message-id';
    });

    await expect(provider.send(buildPayload(userId))).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(dead.deletedAt).not.toBeNull();
    expect(good.deletedAt).toBeNull();
  });
});
