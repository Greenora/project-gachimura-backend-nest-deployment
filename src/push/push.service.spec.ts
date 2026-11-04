import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createECDH, randomBytes } from 'node:crypto';
import { EntityManager, In, Not, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { User } from '../users/entities/user.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  ...jest.requireActual<typeof import('web-push')>('web-push'),
  sendNotification: jest.fn(),
}));

const vapid = webpush.generateVAPIDKeys();
const subscription = () => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: {
    p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  },
});

function setup(
  values: Record<string, string> = {
    WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
    WEB_PUSH_PRIVATE_KEY: vapid.privateKey,
  },
) {
  const stored = {
    findOneBy: jest
      .fn<Promise<PushSubscription | null>, unknown[]>()
      .mockResolvedValue(null),
    countBy: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: Partial<PushSubscription>) => value),
    save: jest.fn().mockResolvedValue({}),
  };
  const users = { findOne: jest.fn().mockResolvedValue({ id: 5 }) };
  const manager = {
    getRepository: (entity: unknown) => (entity === User ? users : stored),
  } as unknown as EntityManager;
  const transaction = jest.fn(
    async (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
  );
  const deleteSubscription = jest.fn().mockResolvedValue({ affected: 1 });
  const findSubscriptions = jest.fn().mockResolvedValue([]);
  const findMembers = jest.fn().mockResolvedValue([]);
  const service = new PushService(
    {
      manager: { transaction },
      delete: deleteSubscription,
      findBy: findSubscriptions,
    } as unknown as Repository<PushSubscription>,
    { find: findMembers } as unknown as Repository<PartyMember>,
    { get: (key: string) => values[key] } as unknown as ConfigService,
  );
  return {
    service,
    stored,
    users,
    transaction,
    deleteSubscription,
    findSubscriptions,
    findMembers,
  };
}

describe('PushService', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest
      .mocked(webpush.sendNotification)
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
  });
  afterEach(() => warn.mockRestore());

  it('is disabled without keys and never exposes private configuration', async () => {
    const { service, findMembers } = setup({});
    expect(service.getConfig()).toEqual({ enabled: false, publicKey: null });
    await expect(service.subscribe(5, subscription())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await service.notifyParty(9, 5);
    expect(findMembers).not.toHaveBeenCalled();
    expect(setup().service.getConfig()).toEqual({
      enabled: true,
      publicKey: vapid.publicKey,
    });
  });

  it('rejects mismatched VAPID keys without logging them', () => {
    const { service } = setup({
      WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
      WEB_PUSH_PRIVATE_KEY: webpush.generateVAPIDKeys().privateKey,
    });
    expect(service.getConfig().enabled).toBe(false);
    expect(warn).toHaveBeenCalledWith('PUSH_CONFIG_INVALID');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(vapid.publicKey);
  });

  it('stores subscriptions for the authenticated user under a short unique hash', async () => {
    const { service, stored, users } = setup();
    const input = subscription();
    await expect(service.subscribe(5, input)).resolves.toEqual({
      subscribed: true,
    });
    expect(users.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(stored.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        endpoint: input.endpoint,
      }),
    );
    expect(stored.create.mock.calls[0][0].endpointHash).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://user:password@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://fcm.googleapis.com/x#fragment',
    'https://fcm.google\napis.com/x',
  ])(
    'rejects endpoints outside known HTTPS push providers: %s',
    async (endpoint) => {
      const { service, transaction } = setup();
      await expect(
        service.subscribe(5, { ...subscription(), endpoint }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://updates.push.services.mozilla.com/wpush/v2/fixture',
    'https://web.push.apple.com/fixture',
    'https://wns2-fixture.notify.windows.com/w/?token=fixture',
  ])('accepts supported browser provider endpoints: %s', async (endpoint) => {
    await expect(
      setup().service.subscribe(5, { ...subscription(), endpoint }),
    ).resolves.toEqual({ subscribed: true });
  });

  it.each(['p256dh', 'auth'] as const)(
    'validates encryption key %s before storing anything',
    async (key) => {
      const { service, transaction } = setup();
      const input = subscription();
      input.keys[key] = randomBytes(key === 'p256dh' ? 65 : 15).toString(
        'base64url',
      );
      await expect(service.subscribe(5, input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('requires uncompressed browser encryption public keys', async () => {
    const { service, transaction } = setup();
    const input = subscription();
    const hybrid = Buffer.from(input.keys.p256dh, 'base64url');
    hybrid[0] = 6 | (hybrid[64] & 1);
    input.keys.p256dh = hybrid.toString('base64url');
    await expect(service.subscribe(5, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('limits new devices but allows an existing device to refresh at the limit', async () => {
    const { service, stored } = setup();
    const input = subscription();
    stored.countBy.mockResolvedValue(10);
    await expect(service.subscribe(5, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    stored.findOneBy.mockResolvedValue({
      id: 1,
      userId: 5,
    } as PushSubscription);
    await expect(service.subscribe(5, input)).resolves.toEqual({
      subscribed: true,
    });
  });

  it('does not reassign another account subscription using different encryption keys', async () => {
    const { service, stored } = setup();
    const input = subscription();
    stored.findOneBy.mockResolvedValue({
      id: 1,
      userId: 8,
      p256dh: 'different',
      auth: 'different',
    } as PushSubscription);
    await expect(service.subscribe(5, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(stored.save).not.toHaveBeenCalled();
  });

  it('deletes only the authenticated account subscription', async () => {
    const { service, deleteSubscription } = setup({});
    await expect(
      service.unsubscribe(5, subscription().endpoint),
    ).resolves.toEqual({ subscribed: false });
    expect(deleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5 }),
    );
  });

  it('does not expose storage errors containing subscription secrets', async () => {
    const { service, transaction, deleteSubscription } = setup();
    const error = new Error('PRIVATE_ENDPOINT_AND_ENCRYPTION_KEYS');
    transaction.mockRejectedValueOnce(error);
    await expect(service.subscribe(5, subscription())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    deleteSubscription.mockRejectedValueOnce(error);
    await expect(
      service.unsubscribe(5, subscription().endpoint),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(warn).toHaveBeenCalledWith('PUSH_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(error.message);
  });

  it('targets approved unmuted members except the sender and sends only a party ID', async () => {
    const { service, findMembers, findSubscriptions } = setup();
    const input = subscription();
    findMembers.mockResolvedValue([{ userId: 6 }, { userId: 6 }]);
    findSubscriptions.mockResolvedValue([
      { id: 1, userId: 6, endpoint: input.endpoint, ...input.keys },
    ]);
    await service.notifyParty(9, 5);
    expect(findMembers).toHaveBeenCalledWith({
      where: {
        partyId: 9,
        status: 'APPROVED',
        isMuted: false,
        userId: Not(5),
      },
      select: { userId: true },
    });
    expect(findSubscriptions).toHaveBeenCalledWith({ userId: In([6]) });
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      input,
      JSON.stringify({ partyId: 9 }),
      expect.objectContaining({ TTL: 3600, timeout: 5000 }),
    );
  });

  it.each([404, 410])(
    'removes expired subscriptions after provider status %s',
    async (statusCode) => {
      const { service, findMembers, findSubscriptions, deleteSubscription } =
        setup();
      const input = subscription();
      findMembers.mockResolvedValue([{ userId: 6 }]);
      findSubscriptions.mockResolvedValue([
        { id: 1, userId: 6, endpoint: input.endpoint, ...input.keys },
      ]);
      jest.mocked(webpush.sendNotification).mockRejectedValue({
        statusCode,
        body: 'PRIVATE_PROVIDER_DETAIL',
        endpoint: input.endpoint,
      });
      await service.notifyParty(9, 5);
      expect(deleteSubscription).toHaveBeenCalledWith({ id: 1, userId: 6 });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'PRIVATE_PROVIDER_DETAIL',
      );
    },
  );

  it('isolates failed deliveries without leaking provider errors', async () => {
    const { service, findMembers, findSubscriptions, deleteSubscription } =
      setup();
    const input = subscription();
    findMembers.mockResolvedValue([{ userId: 6 }]);
    findSubscriptions.mockResolvedValue(
      [1, 2].map((id) => ({
        id,
        userId: 6,
        endpoint: input.endpoint,
        ...input.keys,
      })),
    );
    jest.mocked(webpush.sendNotification).mockRejectedValueOnce({
      statusCode: 500,
      body: 'PRIVATE_PROVIDER_DETAIL',
    });
    await expect(service.notifyParty(9, 5)).resolves.toBeUndefined();
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('PUSH_DELIVERY_FAILED status=500');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      'PRIVATE_PROVIDER_DETAIL',
    );
  });
});
