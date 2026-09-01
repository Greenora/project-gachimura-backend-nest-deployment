import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
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
    const gateway = new ChatGateway(
      chatRepository,
      memberRepository,
      {} as AuthService,
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

    await gateway.handleMessage(
      {
        partyId: 9,
        message: '사칭 방지 테스트',
        userId: 999,
      } as never,
      client,
    );

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
    );
    const client = {
      data: { user: { id: 5 } },
      rooms: new Set(['party_9']),
      emit: jest.fn(),
    } as any;

    await gateway.handleMessage(undefined, client);

    expect(client.emit).toHaveBeenCalledWith(
      'error',
      '올바르지 않은 채팅 메시지입니다.',
    );
  });
});
