import { Repository } from 'typeorm';
import type { Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { ChatGateway } from './chat.gateway';
import { PushService } from '../push/push.service';

const createPushService = () =>
  ({
    notifyParty: jest.fn().mockResolvedValue(undefined),
  }) as unknown as PushService;

describe('ChatGateway', () => {
  it('잘못 인코딩된 인증 쿠키는 예외 없이 연결을 거절한다', () => {
    const verifyAccessToken = jest.fn();
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {} as Repository<PartyMember>,
      { verifyAccessToken } as unknown as AuthService,
      createPushService(),
    );
    const emit = jest.fn();
    const disconnect = jest.fn();
    const client = {
      handshake: { headers: { cookie: 'accessToken=%E0%A4%A' } },
      emit,
      disconnect,
    } as unknown as Socket;
    expect(() => gateway.handleConnection(client)).not.toThrow();
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('error', '채팅 인증에 실패했습니다.');
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('메시지 발신자를 클라이언트 userId가 아닌 인증 사용자로 저장한다', async () => {
    const create = jest.fn((value: Partial<ChatMessage>) => value);
    const chatRepository = {
      create,
      save: jest.fn().mockResolvedValue({
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
      }),
    } as unknown as Repository<ChatMessage>;
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue({
        user: {
          id: 5,
          nickname: '인증 사용자',
          nickname_jp: '認証ユーザー',
          profileImage: null,
        },
      }),
    } as unknown as Repository<PartyMember>;
    const notifyParty = jest
      .fn()
      .mockRejectedValue(new Error('private provider details'));
    const gateway = new ChatGateway(
      chatRepository,
      memberRepository,
      {} as AuthService,
      { notifyParty } as unknown as PushService,
    );
    const emit = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit }),
    } as never;
    const client = {
      data: { user: { id: 5 } },
      rooms: new Set(['party_9']),
      emit: jest.fn(),
    } as never;

    const reply = await gateway.handleMessage(
      {
        partyId: 9,
        message: '사칭 방지 테스트',
        userId: 999,
      } as never,
      client,
    );

    expect(reply).toEqual({ ok: true });
    expect(notifyParty).toHaveBeenCalledWith(9, 5);
    expect(create).toHaveBeenCalledWith({
      partyId: 9,
      senderId: 5,
      content: '사칭 방지 테스트',
      messageType: 'TALK',
    });
    expect(emit).toHaveBeenCalledWith(
      'message',
      expect.objectContaining({ userId: 5, nickname: '인증 사용자' }),
    );
  });

  it('빈 채팅 payload를 예외 없이 거부한다', async () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {} as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const emit = jest.fn();
    const client = {
      data: { user: { id: 5 } },
      rooms: new Set(['party_9']),
      emit,
    } as unknown as Socket;

    const reply = await gateway.handleMessage(undefined, client);

    expect(reply.ok).toBe(false);
    expect(emit).toHaveBeenCalledWith(
      'error',
      '올바르지 않은 채팅 메시지입니다.',
    );
  });

  it('입장 완료를 기다린 뒤 성공 응답을 보낸다', async () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {
        findOne: jest.fn().mockResolvedValue({ id: 1 }),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    let finishJoin!: () => void;
    const join = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishJoin = resolve;
        }),
    );
    const client = {
      data: { user: { id: 5 } },
      join,
      emit: jest.fn(),
    } as unknown as Socket;
    const settled = jest.fn();
    const pending = gateway
      .handleJoinRoom({ partyId: 9 }, client)
      .then(settled);
    await new Promise((resolve) => setImmediate(resolve));
    expect(join).toHaveBeenCalledWith('party_9');
    expect(settled).not.toHaveBeenCalled();
    finishJoin();
    await pending;
    expect(settled).toHaveBeenCalledWith({ ok: true });
  });

  it('승인되지 않은 멤버는 실패 응답을 받고 방에 입장하지 못한다', async () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {
        findOne: jest.fn().mockResolvedValue(null),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const join = jest.fn();
    const client = {
      data: { user: { id: 5 } },
      join,
      emit: jest.fn(),
    } as unknown as Socket;
    expect(await gateway.handleJoinRoom({ partyId: 9 }, client)).toEqual({
      ok: false,
      error: '해당 모임의 멤버가 아닙니다.',
    });
    expect(join).not.toHaveBeenCalled();
  });

  it('저장 실패 시 성공 응답이나 메시지 방송을 하지 않는다', async () => {
    const gateway = new ChatGateway(
      {
        create: jest.fn((value: Partial<ChatMessage>) => value),
        save: jest
          .fn()
          .mockRejectedValue(new Error('private database details')),
      } as unknown as Repository<ChatMessage>,
      {
        findOne: jest.fn().mockResolvedValue({ user: { nickname: 'Tester' } }),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const broadcast = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: broadcast }),
    } as never;
    const client = {
      data: { user: { id: 5 } },
      rooms: new Set(['party_9']),
      emit: jest.fn(),
    } as unknown as Socket;
    expect(
      await gateway.handleMessage(
        { partyId: 9, message: 'keep this draft' },
        client,
      ),
    ).toEqual({
      ok: false,
      error: '메시지를 저장하지 못했습니다. 다시 시도해주세요.',
    });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('멤버 조회 오류는 안전한 입장 실패 응답으로 처리한다', async () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {
        findOne: jest
          .fn()
          .mockRejectedValue(new Error('private database details')),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const join = jest.fn();
    const client = {
      data: { user: { id: 5 } },
      join,
      emit: jest.fn(),
    } as unknown as Socket;
    expect(await gateway.handleJoinRoom({ partyId: 9 }, client)).toEqual({
      ok: false,
      error: '채팅방에 입장하지 못했습니다. 다시 시도해주세요.',
    });
    expect(join).not.toHaveBeenCalled();
  });
});
