import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { Server } from 'node:http';
import request from 'supertest';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { ChatMessageController } from '../chat-message/chat-message.controller';
import { ChatMessageService } from '../chat-message/chat-message.service';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { PushService } from '../push/push.service';
import { ChatGateway } from './chat.gateway';
import {
  CHAT_RATE_LIMIT_CODE,
  CHAT_RATE_LIMIT_MESSAGE,
  ChatRateLimitService,
} from './chat-rate-limit.service';

describe('REST and WebSocket shared chat limit', () => {
  let app: INestApplication<Server>;
  let gateway: ChatGateway;
  let clock: jest.SpyInstance;
  const now = 1900000000000;
  const create = jest.fn((value: Partial<ChatMessage>) => value);
  const save = jest.fn((value: Partial<ChatMessage>) =>
    Promise.resolve({ ...value, id: 7, createdAt: new Date() }),
  );
  const messages = { create, save };
  const members = {
    findOne: jest.fn(({ where }: { where: { userId: number } }) =>
      Promise.resolve(
        where.userId === 303 ? null : { user: { nickname: 'Fixture member' } },
      ),
    ),
    find: jest.fn().mockResolvedValue([]),
  };
  const notifyParty = jest.fn().mockResolvedValue(undefined);
  const socket = (userId: number) =>
    ({
      data: { user: { id: userId } },
      rooms: new Set(['party_9']),
      emit: jest.fn(),
      disconnect: jest.fn(),
    }) as unknown as Socket;

  beforeAll(async () => {
    clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const fixture = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }])],
      controllers: [ChatMessageController],
      providers: [
        ChatMessageService,
        ChatRateLimitService,
        { provide: getRepositoryToken(ChatMessage), useValue: messages },
        { provide: getRepositoryToken(PartyMember), useValue: members },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
            user: { id: number };
          }>();
          req.user = { id: Number(req.headers['x-fixture-user'] || 101) };
          return true;
        },
      })
      .compile();
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    gateway = new ChatGateway(
      messages as unknown as Repository<ChatMessage>,
      members as unknown as Repository<PartyMember>,
      {} as AuthService,
      { notifyParty } as unknown as PushService,
      app.get(ChatRateLimitService),
    );
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as never;
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app?.close();
    clock?.mockRestore();
  });

  const send = (userId: number) =>
    request(app.getHttpServer())
      .post('/api/chat-message')
      .set('x-fixture-user', String(userId))
      .send({ partyId: 9, content: 'Fixture message' });

  it('counts REST, multiple sockets and reconnects under the same account budget before writes or push', async () => {
    for (let index = 0; index < 30; index++) {
      await expect(
        gateway.handleMessage(
          { partyId: 9, message: 'Fixture message' },
          socket(101),
        ),
      ).resolves.toEqual({ ok: true });
      await send(101).expect(201);
    }
    expect(save).toHaveBeenCalledTimes(60);
    expect(notifyParty).toHaveBeenCalledTimes(30);
    const reconnected = socket(101);
    await expect(
      gateway.handleMessage(
        { partyId: 9, message: 'Blocked message' },
        reconnected,
      ),
    ).resolves.toEqual({
      ok: false,
      code: CHAT_RATE_LIMIT_CODE,
      error: CHAT_RATE_LIMIT_MESSAGE,
    });
    expect(jest.spyOn(reconnected, 'emit')).not.toHaveBeenCalled();
    expect(jest.spyOn(reconnected, 'disconnect')).not.toHaveBeenCalled();
    const response = await send(101).expect(429);
    expect(response.body).toMatchObject({ code: CHAT_RATE_LIMIT_CODE });
    expect(save).toHaveBeenCalledTimes(60);
    expect(create).toHaveBeenCalledTimes(60);
    expect(notifyParty).toHaveBeenCalledTimes(30);
  });

  it('keeps a different account on the same HTTP address independent', async () => {
    await send(202).expect(201);
    await expect(
      gateway.handleMessage(
        { partyId: 9, message: 'Fixture message' },
        socket(202),
      ),
    ).resolves.toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(notifyParty).toHaveBeenCalledTimes(1);
  });

  it('allows the blocked account again after the cooldown', async () => {
    clock.mockReturnValue(now + 60001);
    await send(101).expect(201);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('preserves membership and message length checks', async () => {
    await send(303).expect(403);
    await expect(
      gateway.handleMessage(
        { partyId: 9, message: 'Fixture message' },
        socket(303),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: '해당 모임의 멤버가 아닙니다.',
    });
    await request(app.getHttpServer())
      .post('/api/chat-message')
      .send({ partyId: 9, content: 'x'.repeat(2001) })
      .expect(400);
    await expect(
      gateway.handleMessage(
        { partyId: 9, message: 'x'.repeat(2001) },
        socket(202),
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(save).not.toHaveBeenCalled();
    expect(notifyParty).not.toHaveBeenCalled();
  });

  it('does not save or push when the shared limit storage fails', async () => {
    const storage = app.get<ThrottlerStorage>(ThrottlerStorage);
    const increment = jest
      .spyOn(storage, 'increment')
      .mockRejectedValue(new Error('fixture storage failure'));
    try {
      const response = await send(404).expect(500);
      expect(response.text).not.toContain('fixture storage failure');
      await expect(
        gateway.handleMessage(
          { partyId: 9, message: 'Fixture message' },
          socket(404),
        ),
      ).resolves.toMatchObject({
        ok: false,
        error: '메시지를 저장하지 못했습니다. 다시 시도해주세요.',
      });
      expect(save).not.toHaveBeenCalled();
      expect(notifyParty).not.toHaveBeenCalled();
    } finally {
      increment.mockRestore();
    }
  });
});
