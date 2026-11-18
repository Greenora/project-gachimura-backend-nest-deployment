import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import axios from 'axios';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('axios');

function fixture(account: Record<string, unknown>) {
  const repository = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: Partial<User>) => value),
    save: jest.fn((value: Partial<User>) =>
      Promise.resolve({ id: 9, ...value }),
    ),
  };
  jest.mocked(axios).post.mockResolvedValue({
    data: { access_token: 'fixture-provider-token' },
  });
  jest.mocked(axios).get.mockResolvedValue({
    data: { id: 12345, kakao_account: account },
  });
  const service = new UsersService(
    repository as unknown as Repository<User>,
    new ConfigService({ KAKAO_CLIENT_ID: 'fixture-client-id' }),
  );
  return { service, repository };
}

const login = (service: UsersService) =>
  service.kakaoLogin('fixture-code', 'http://localhost/kakao/callback');

describe('카카오 이메일 신뢰 및 계정 연결', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    {},
    { is_email_valid: true },
    { is_email_verified: true },
    { is_email_valid: true, is_email_verified: false },
    { is_email_valid: false, is_email_verified: true },
    { is_email_valid: false, is_email_verified: false },
  ])(
    '미인증·무효·확인값 누락 이메일을 기존 계정 연결에 사용하지 않는다 (%p)',
    async (flags) => {
      const { service, repository } = fixture({
        email: 'existing@example.test',
        ...flags,
      });
      repository.findOne.mockImplementation(
        ({ where }: { where: Partial<User> }) =>
          Promise.resolve(
            where.email === 'existing@example.test'
              ? { id: 7, email: where.email, provider: 'LOCAL' }
              : null,
          ),
      );

      const result = await login(service);

      expect(repository.findOne).not.toHaveBeenCalledWith({
        where: { email: 'existing@example.test' },
      });
      expect(result.user.id).not.toBe(7);
      expect(result.user.email).toBe('12345@kakao.com');
      expect(repository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 7 }),
      );
    },
  );

  it.each(['LOCAL', 'LINE', 'KAKAO'] as const)(
    '인증된 이메일이 같아도 기존 %s 계정에 자동 연결하지 않는다',
    async (provider) => {
      const { service, repository } = fixture({
        email: 'existing@example.test',
        is_email_valid: true,
        is_email_verified: true,
      });
      const existing = {
        id: 7,
        email: 'existing@example.test',
        provider,
        sns_id: 'existing-provider-id',
      };
      repository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);

      await expect(login(service)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(existing).toEqual({
        id: 7,
        email: 'existing@example.test',
        provider,
        sns_id: 'existing-provider-id',
      });
    },
  );

  it('기존 카카오 회원번호 로그인은 이메일 동의 여부와 무관하게 유지한다', async () => {
    const { service, repository } = fixture({});
    const existing = { id: 7, provider: 'KAKAO', sns_id: '12345' };
    repository.findOne.mockResolvedValueOnce(existing);

    await expect(login(service)).resolves.toMatchObject({ user: existing });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('새 카카오 계정의 유효하고 인증된 이메일만 저장한다', async () => {
    const { service, repository } = fixture({
      email: 'new@example.test',
      is_email_valid: true,
      is_email_verified: true,
    });

    await expect(login(service)).resolves.toMatchObject({
      user: { provider: 'KAKAO', sns_id: '12345', email: 'new@example.test' },
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});
