import { User } from './entities/user.entity';
import { toPublicUser } from './user-response.mapper';

describe('toPublicUser', () => {
  it('민감정보를 공개 사용자 응답에서 제외한다', () => {
    const user = {
      id: 1,
      email: 'private@example.com',
      password: 'hashed-password',
      refreshToken: 'hashed-refresh-token',
      nickname: '테스트 사용자',
      nickname_jp: 'テスト',
      profileImage: null,
      phoneNumber: '01000000000',
      bankName: '테스트은행',
      accountNumber: '123456789',
      treeScore: 50,
      reviewsCount: 0,
    } as User;

    const result = toPublicUser(user);

    expect(result).toEqual({
      id: 1,
      nickname: '테스트 사용자',
      nickname_jp: 'テスト',
      profileImage: null,
      treeScore: 50,
      reviewsCount: 0,
    });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('accountNumber');
  });
});
