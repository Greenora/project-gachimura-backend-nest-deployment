import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('위도와 경도 0을 유효한 값으로 저장한다', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const usersRepository = {
      update,
    } as unknown as Repository<User>;
    const service = new UsersService(usersRepository, {} as ConfigService);

    await service.updateLocation(8, {
      latitude: 0,
      longitude: 0,
      region: '영점 테스트',
      district: '영점 테스트',
    });

    expect(update).toHaveBeenCalledWith(8, {
      latitude: 0,
      longitude: 0,
      region: '영점 테스트',
      district: '영점 테스트',
    });
  });
});
