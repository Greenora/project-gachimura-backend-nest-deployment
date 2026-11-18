import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from './entities/party-member.entity';
import { PartyMembersService } from './party-members.service';

describe('PartyMembersService', () => {
  it('방장이 아닌 사용자의 멤버 상태 변경을 거절한다', async () => {
    const findMember = jest.fn();
    const memberRepository = {
      findOne: findMember,
    } as unknown as Repository<PartyMember>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
    } as unknown as Repository<Party>;
    const chatGateway = {} as ChatGateway;
    const service = new PartyMembersService(
      memberRepository,
      partyRepository,
      chatGateway,
    );

    await expect(
      service.updateStatus(9, 9, 'APPROVED', 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMember).not.toHaveBeenCalled();
  });

  it('일반 멤버에게는 승인된 멤버 목록만 반환한다', async () => {
    const findMember = jest.fn().mockResolvedValue({ status: 'APPROVED' });
    const findMembers = jest.fn().mockResolvedValue([]);
    const memberRepository = {
      findOne: findMember,
      find: findMembers,
    } as unknown as Repository<PartyMember>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
    } as unknown as Repository<Party>;
    const service = new PartyMembersService(
      memberRepository,
      partyRepository,
      {} as ChatGateway,
    );

    await service.findAllByParty(9, 2);

    expect(findMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { partyId: 9, status: 'APPROVED' },
      }),
    );
  });

  it('방장 자신을 강퇴하지 못하게 한다', async () => {
    const memberRepository = {} as Repository<PartyMember>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
    } as unknown as Repository<Party>;
    const service = new PartyMembersService(
      memberRepository,
      partyRepository,
      {} as ChatGateway,
    );

    await expect(service.remove(9, 1, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('이미 승인된 멤버를 다시 승인해도 가입 메시지를 중복 발송하지 않는다', async () => {
    const save = jest
      .fn()
      .mockImplementation((member: PartyMember) => Promise.resolve(member));
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue({
        partyId: 9,
        userId: 2,
        status: 'APPROVED',
        user: { nickname: '테스트', nickname_jp: 'テスト' },
      }),
      save,
    } as unknown as Repository<PartyMember>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
    } as unknown as Repository<Party>;
    const sendSystemMessage = jest.fn();
    const service = new PartyMembersService(memberRepository, partyRepository, {
      sendSystemMessage,
      notifyPartyUpdated: jest.fn(),
    } as unknown as ChatGateway);

    await service.updateStatus(9, 2, 'APPROVED', 1);

    expect(save).toHaveBeenCalled();
    expect(sendSystemMessage).not.toHaveBeenCalled();
  });

  it.each(['REJECTED', 'PENDING'])(
    '승인을 %s 상태로 바꾼 뒤 해당 멤버를 채팅방에서 내보낸다',
    async (status) => {
      let saved = false;
      let evicted = false;
      let countUpdated = false;
      const removeMemberFromRoom = jest.fn().mockImplementation(() => {
        expect(saved).toBe(true);
        evicted = true;
        return Promise.resolve();
      });
      const notifyPartyUpdated = jest.fn().mockImplementation(() => {
        expect(evicted).toBe(true);
        expect(countUpdated).toBe(true);
        return Promise.resolve();
      });
      const service = new PartyMembersService(
        {
          findOne: jest.fn().mockResolvedValue({
            partyId: 9,
            userId: 2,
            status: 'APPROVED',
          }),
          save: jest.fn().mockImplementation((member: PartyMember) => {
            saved = true;
            return Promise.resolve(member);
          }),
          count: jest.fn().mockResolvedValue(1),
        } as unknown as Repository<PartyMember>,
        {
          findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
          update: jest.fn().mockImplementation(() => {
            countUpdated = true;
            return Promise.resolve({ affected: 1 });
          }),
        } as unknown as Repository<Party>,
        { removeMemberFromRoom, notifyPartyUpdated } as unknown as ChatGateway,
      );

      await service.updateStatus(9, 2, status, 1);

      expect(removeMemberFromRoom).toHaveBeenCalledWith(9, 2);
      expect(notifyPartyUpdated).toHaveBeenCalledWith(9);
    },
  );

  it('멤버 상태 저장에 실패하면 기존 채팅방에서 내보내지 않는다', async () => {
    const removeMemberFromRoom = jest.fn();
    const notifyPartyUpdated = jest.fn();
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        save: jest.fn().mockRejectedValue(new Error('fixture write failed')),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
      } as unknown as Repository<Party>,
      { removeMemberFromRoom, notifyPartyUpdated } as unknown as ChatGateway,
    );

    await expect(service.updateStatus(9, 2, 'REJECTED', 1)).rejects.toThrow(
      'fixture write failed',
    );
    expect(removeMemberFromRoom).not.toHaveBeenCalled();
    expect(notifyPartyUpdated).not.toHaveBeenCalled();
  });

  it('멤버 삭제가 완료되면 채팅방에서 내보낸 후 퇴장 안내를 보낸다', async () => {
    let deleted = false;
    let evicted = false;
    let countUpdated = false;
    const removeMemberFromRoom = jest.fn().mockImplementation(() => {
      expect(deleted).toBe(true);
      evicted = true;
      return Promise.resolve();
    });
    const sendSystemMessage = jest.fn().mockImplementation(() => {
      expect(evicted).toBe(true);
      return Promise.resolve();
    });
    const notifyPartyUpdated = jest.fn().mockImplementation(() => {
      expect(evicted).toBe(true);
      expect(countUpdated).toBe(true);
    });
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue({
          partyId: 9,
          userId: 2,
          status: 'APPROVED',
          user: { nickname: '탈퇴 멤버' },
        }),
        delete: jest.fn().mockImplementation(() => {
          deleted = true;
          return Promise.resolve({ affected: 1 });
        }),
        count: jest.fn().mockResolvedValue(1),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
        update: jest.fn().mockImplementation(() => {
          countUpdated = true;
          return Promise.resolve({ affected: 1 });
        }),
      } as unknown as Repository<Party>,
      {
        removeMemberFromRoom,
        sendSystemMessage,
        notifyPartyUpdated,
      } as unknown as ChatGateway,
    );

    expect(await service.remove(9, 2, 1)).toEqual({ affected: 1 });
    expect(removeMemberFromRoom).toHaveBeenCalledWith(9, 2);
    expect(notifyPartyUpdated).toHaveBeenCalledWith(9);
    expect(sendSystemMessage).toHaveBeenCalledWith(
      9,
      expect.stringContaining('__SYS__|LEAVE|'),
    );
  });

  it('멤버 삭제에 실패하면 퇴장 안내나 채팅방 퇴장을 실행하지 않는다', async () => {
    const removeMemberFromRoom = jest.fn();
    const sendSystemMessage = jest.fn();
    const notifyPartyUpdated = jest.fn();
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        delete: jest.fn().mockRejectedValue(new Error('fixture write failed')),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
      } as unknown as Repository<Party>,
      {
        removeMemberFromRoom,
        sendSystemMessage,
        notifyPartyUpdated,
      } as unknown as ChatGateway,
    );

    await expect(service.remove(9, 2, 1)).rejects.toThrow(
      'fixture write failed',
    );
    expect(removeMemberFromRoom).not.toHaveBeenCalled();
    expect(sendSystemMessage).not.toHaveBeenCalled();
    expect(notifyPartyUpdated).not.toHaveBeenCalled();
  });

  it('가입 신청을 저장한 뒤 모임 갱신을 알린다', async () => {
    const order: string[] = [];
    const notifyPartyUpdated = jest.fn(() => order.push('notify'));
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((member: Partial<PartyMember>) => member),
        save: jest.fn().mockImplementation((member: PartyMember) => {
          order.push('save');
          return Promise.resolve({ id: 99, ...member });
        }),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 9, hostId: 1, status: 'RECRUITING' }),
      } as unknown as Repository<Party>,
      { notifyPartyUpdated } as unknown as ChatGateway,
    );

    expect(await service.create(9, 2, 2)).toMatchObject({
      id: 99,
      status: 'PENDING',
    });
    expect(order).toEqual(['save', 'notify']);
    expect(notifyPartyUpdated).toHaveBeenCalledWith(9);
  });

  it('가입 신청 저장에 실패하면 모임 갱신을 알리지 않는다', async () => {
    const notifyPartyUpdated = jest.fn();
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((member: Partial<PartyMember>) => member),
        save: jest.fn().mockRejectedValue(new Error('fixture write failed')),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 9, hostId: 1, status: 'RECRUITING' }),
      } as unknown as Repository<Party>,
      { notifyPartyUpdated } as unknown as ChatGateway,
    );

    await expect(service.create(9, 2, 2)).rejects.toThrow(
      'fixture write failed',
    );
    expect(notifyPartyUpdated).not.toHaveBeenCalled();
  });

  it('모임 갱신 알림 실패가 저장된 가입 신청을 실패로 표시하지 않는다', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new PartyMembersService(
      {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((member: Partial<PartyMember>) => member),
        save: jest.fn().mockResolvedValue({ id: 99, status: 'PENDING' }),
      } as unknown as Repository<PartyMember>,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 9, hostId: 1, status: 'RECRUITING' }),
      } as unknown as Repository<Party>,
      {
        notifyPartyUpdated: jest.fn(() => {
          throw new Error('PRIVATE_SOCKET_FAILURE');
        }),
      } as unknown as ChatGateway,
    );

    try {
      await expect(service.create(9, 2, 2)).resolves.toEqual({
        id: 99,
        status: 'PENDING',
      });
      expect(warn).toHaveBeenCalledWith('모임 상태 갱신을 알리지 못했습니다.');
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'PRIVATE_SOCKET_FAILURE',
      );
    } finally {
      warn.mockRestore();
    }
  });
});
