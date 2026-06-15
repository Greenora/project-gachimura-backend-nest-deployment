import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    } as unknown as ChatGateway);

    await service.updateStatus(9, 2, 'APPROVED', 1);

    expect(save).toHaveBeenCalled();
    expect(sendSystemMessage).not.toHaveBeenCalled();
  });
});
