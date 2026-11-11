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
  it('모임 갱신은 해당 모임방에 모임 ID만 전달한다', () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {} as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.notifyPartyUpdated(9);

    expect(to).toHaveBeenCalledWith('party_9');
    expect(emit).toHaveBeenCalledWith('partyUpdated', { partyId: 9 });
  });

  it('정산 갱신은 해당 모임방에 ID만 전달한다', () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {} as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    gateway.notifySettlementUpdated(9, 8);
    expect(to).toHaveBeenCalledWith('party_9');
    expect(emit).toHaveBeenCalledWith('settlementUpdated', {
      partyId: 9,
      settlementId: 8,
    });
  });

  it('제외된 멤버의 모든 연결을 해당 방에서만 내보내고 계좌 안내를 전달하지 않는다', async () => {
    const socket = (userId: number, rooms: string[]) => {
      const memberships = new Set(rooms);
      return {
        data: { user: { id: userId } },
        rooms: memberships,
        leave: jest.fn((room: string) => memberships.delete(room)),
        received: jest.fn(),
      };
    };
    const removedPhone = socket(2, ['party_9', 'party_10']);
    const removedPc = socket(2, ['party_9']);
    const anotherParty = socket(2, ['party_10']);
    const approvedGuest = socket(3, ['party_9']);
    const clients = [removedPhone, removedPc, anotherParty, approvedGuest];
    const gateway = new ChatGateway(
      {
        create: jest.fn((value: Partial<ChatMessage>) => value),
        save: jest.fn().mockResolvedValue({ createdAt: new Date() }),
      } as unknown as Repository<ChatMessage>,
      {
        findOne: jest.fn().mockResolvedValue({
          user: { id: 1, nickname: '방장' },
        }),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const inRoom = jest.fn((room: string) => ({
      fetchSockets: jest
        .fn()
        .mockResolvedValue(clients.filter((client) => client.rooms.has(room))),
    }));
    gateway.server = {
      in: inRoom,
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          for (const client of clients) {
            if (client.rooms.has(room)) client.received(event, payload);
          }
        },
      }),
    } as never;

    await gateway.removeMemberFromRoom(9, 2);

    expect(inRoom).toHaveBeenCalledWith('party_9');
    expect(removedPhone.leave).toHaveBeenCalledWith('party_9');
    expect(removedPc.leave).toHaveBeenCalledWith('party_9');
    expect(removedPhone.rooms.has('party_10')).toBe(true);
    expect(anotherParty.leave).not.toHaveBeenCalled();
    expect(approvedGuest.leave).not.toHaveBeenCalled();

    const message = '입금 계좌 안내: 테스트은행 fixture-account';
    expect(
      await gateway.handleMessage({ partyId: 9, message }, {
        data: { user: { id: 1 } },
        rooms: new Set(['party_9']),
      } as unknown as Socket),
    ).toEqual({ ok: true });
    expect(removedPhone.received).not.toHaveBeenCalled();
    expect(removedPc.received).not.toHaveBeenCalled();
    expect(anotherParty.received).not.toHaveBeenCalled();
    expect(approvedGuest.received).toHaveBeenCalledWith(
      'message',
      expect.objectContaining({ message }),
    );
  });

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

  it('입장 대기 중 승인이 취소된 멤버는 방에 남지 않는다', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      { findOne } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    let finishJoin!: () => void;
    const rooms = new Set<string>();
    const join = jest.fn(
      (room: string) =>
        new Promise<void>((resolve) => {
          finishJoin = () => {
            rooms.add(room);
            resolve();
          };
        }),
    );
    const leave = jest.fn((room: string) => rooms.delete(room));
    const client = {
      data: { user: { id: 5 } },
      join,
      leave,
      emit: jest.fn(),
    } as unknown as Socket;
    const pending = gateway.handleJoinRoom({ partyId: 9 }, client);
    await new Promise((resolve) => setImmediate(resolve));
    expect(findOne).toHaveBeenCalledTimes(1);
    finishJoin();

    expect(await pending).toEqual({
      ok: false,
      error: '해당 모임의 멤버가 아닙니다.',
    });
    expect(leave).toHaveBeenCalledWith('party_9');
    expect(rooms.has('party_9')).toBe(false);
  });

  it('입장 직후 멤버 재확인에 실패하면 방에서 빠져나온다', async () => {
    const gateway = new ChatGateway(
      {} as Repository<ChatMessage>,
      {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 1 })
          .mockRejectedValueOnce(new Error('fixture database unavailable')),
      } as unknown as Repository<PartyMember>,
      {} as AuthService,
      createPushService(),
    );
    const leave = jest.fn();
    const client = {
      data: { user: { id: 5 } },
      join: jest.fn(),
      leave,
      emit: jest.fn(),
    } as unknown as Socket;

    expect(await gateway.handleJoinRoom({ partyId: 9 }, client)).toEqual({
      ok: false,
      error: '채팅방에 입장하지 못했습니다. 다시 시도해주세요.',
    });
    expect(leave).toHaveBeenCalledWith('party_9');
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
