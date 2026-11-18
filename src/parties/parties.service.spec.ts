import { Repository } from 'typeorm';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { Party } from './entities/party.entity';
import { PartiesService } from './parties.service';
import { ChatGateway } from '../chat/chat.gateway';
import { Logger } from '@nestjs/common';

describe('PartiesService', () => {
  it('파티 목록의 호스트 민감정보를 제외한다', async () => {
    const partyRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1,
          title: '테스트 파티',
          host: {
            id: 8,
            email: 'private@example.com',
            password: 'hashed-password',
            refreshToken: 'hashed-refresh-token',
            nickname: '방장',
            treeScore: 50,
            reviewsCount: 0,
          },
        },
      ]),
    } as unknown as Repository<Party>;
    const service = new PartiesService(
      partyRepository,
      {} as Repository<PartyMember>,
      {} as ChatGateway,
    );

    const [party] = await service.findAll();

    expect(party.host).not.toHaveProperty('password');
    expect(party.host).not.toHaveProperty('refreshToken');
    expect(party.host).not.toHaveProperty('email');
  });

  it('상태 저장 후 모임에 알리고, 알림 실패로 저장 성공을 되돌리지 않는다', async () => {
    const party = { id: 1, hostId: 8, status: 'SETTLING' };
    const repository = {
      findOne: jest.fn().mockResolvedValue(party),
      save: jest.fn().mockImplementation((value) => {
        expect(gateway.notifyPartyUpdated).not.toHaveBeenCalled();
        return Promise.resolve(value);
      }),
    };
    const gateway = {
      notifyPartyUpdated: jest.fn().mockImplementation(() => {
        throw new Error('fixture socket failure');
      }),
    };
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      const service = new PartiesService(
        repository as unknown as Repository<Party>,
        {} as Repository<PartyMember>,
        gateway as unknown as ChatGateway,
      );
      await expect(service.updateStatus(1, 'CLOSED', 8)).resolves.toMatchObject(
        { status: 'CLOSED' },
      );
      expect(gateway.notifyPartyUpdated).toHaveBeenCalledWith(1);
      expect(warn).toHaveBeenCalled();
      repository.save.mockRejectedValueOnce(new Error('fixture write failure'));
      gateway.notifyPartyUpdated.mockClear();
      await expect(service.updateStatus(1, 'CLOSED', 8)).rejects.toThrow(
        'fixture write failure',
      );
      expect(gateway.notifyPartyUpdated).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('참여 신청 저장 후 모임에 알리고 실패한 저장에는 알리지 않는다', async () => {
    const members = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((value: Partial<PartyMember>) => value),
      save: jest.fn().mockResolvedValue({ id: 3 }),
    };
    const gateway = { notifyPartyUpdated: jest.fn() };
    const service = new PartiesService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 1, hostId: 8, status: 'RECRUITING' }),
      } as unknown as Repository<Party>,
      members as unknown as Repository<PartyMember>,
      gateway as unknown as ChatGateway,
    );
    await service.joinParty(1, 9);
    expect(gateway.notifyPartyUpdated).toHaveBeenCalledWith(1);
    gateway.notifyPartyUpdated.mockClear();
    members.save.mockRejectedValueOnce(new Error('fixture write failure'));
    await expect(service.joinParty(1, 10)).rejects.toThrow(
      'fixture write failure',
    );
    expect(gateway.notifyPartyUpdated).not.toHaveBeenCalled();
  });
});
