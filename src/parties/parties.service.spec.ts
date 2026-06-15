import { Repository } from 'typeorm';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { Party } from './entities/party.entity';
import { PartiesService } from './parties.service';

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
    );

    const [party] = await service.findAll();

    expect(party.host).not.toHaveProperty('password');
    expect(party.host).not.toHaveProperty('refreshToken');
    expect(party.host).not.toHaveProperty('email');
  });
});
