import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { SignupDto } from '../auth/dto/signup.dto';
import { EmailVerification } from '../auth/entities/email-verification.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const signup = {
  email: 'contact-fixture@example.test',
  password: 'Fixture123',
  nickname: '연락처 테스트',
};

async function validated<T>(body: unknown, metatype: new () => T): Promise<T> {
  const result: unknown = await pipe.transform(body, {
    type: 'body',
    metatype,
  });
  return result as T;
}

describe('member details request validation', () => {
  beforeAll(() => jest.useFakeTimers({ now: new Date(2026, 10, 4, 12) }));
  afterAll(() => jest.useRealTimers());

  it.each([
    ['01012341234', '01012341234'],
    ['010-1234-1234', '01012341234'],
    [' 010 1234 1234 ', '01012341234'],
    ['090-1234-5678', '09012345678'],
    ['03-1234-5678', '0312345678'],
    ['012345678', '012345678'],
  ])(
    'normalizes accepted phone input %s for signup and profile',
    async (phone, expected) => {
      const created = await validated({ ...signup, phone }, SignupDto);
      const updated = await validated({ phone }, UpdateProfileDto);
      expect(created.phone).toBe(expected);
      expect(updated.phone).toBe(expected);
    },
  );

  it.each([
    '',
    '1234567890',
    '0101234',
    '010123456789',
    '+821012341234',
    '010abc1234',
    1012341234,
  ])('rejects malformed phone %p for signup and profile', async (phone) => {
    await expect(validated({ ...signup, phone }, SignupDto)).rejects.toThrow();
    await expect(validated({ phone }, UpdateProfileDto)).rejects.toThrow();
  });

  it.each([
    ['1998-01-01', 1998, 1, 1],
    ['2000-02-29', 2000, 2, 29],
    ['1000-01-01', 1000, 1, 1],
    ['2026-11-04', 2026, 11, 4],
    ['980101', 1998, 1, 1],
    ['261104', 2026, 11, 4],
    ['261105', 1926, 11, 5],
  ])(
    'accepts birth date %s without losing its calendar day',
    async (birthdate, year, month, day) => {
      const body = await validated({ ...signup, birthdate }, SignupDto);
      const date = body.birthdate as unknown as Date;
      expect(date).toBeInstanceOf(Date);
      expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual(
        [year, month, day],
      );
      const updated = await validated({ birthdate }, UpdateProfileDto);
      expect(updated.birthdate).toEqual(date);
    },
  );

  it.each([
    '2026-11-05',
    '2027-01-01',
    '2025-02-29',
    '1998-02-30',
    '1998-13-01',
    '1998-01-00',
    '0999-12-31',
    '19980101',
    '1998-01-01T00:00:00Z',
    '990230',
    980101,
    {},
  ])('rejects impossible or future birth date %p', async (birthdate) => {
    await expect(
      validated({ ...signup, birthdate }, SignupDto),
    ).rejects.toThrow();
    await expect(validated({ birthdate }, UpdateProfileDto)).rejects.toThrow();
  });

  it('keeps omitted and explicitly cleared contact fields distinct', async () => {
    const omitted = await validated({ ...signup }, SignupDto);
    expect(omitted.phone).toBeUndefined();
    expect(omitted.birthdate).toBeUndefined();
    const cleared = await validated(
      { phone: null, birthdate: null },
      UpdateProfileDto,
    );
    expect(cleared.phone).toBeNull();
    expect(cleared.birthdate).toBeNull();
    await expect(
      validated({ phoneNumber: '01012341234' }, UpdateProfileDto),
    ).rejects.toThrow();
  });
});

function fixture() {
  const user = Object.assign(new User(), {
    id: 8,
    email: signup.email,
    nickname: signup.nickname,
    phoneNumber: '01099998888',
    birthDate: new Date(1990, 0, 2),
  });
  const create = jest.fn((fields: Partial<User>) =>
    Object.assign(new User(), fields),
  );
  const save = jest.fn((fields: User) =>
    Promise.resolve(Object.assign(user, fields)),
  );
  const update = jest.fn((_id: number, fields: Partial<User>) => {
    Object.assign(user, fields);
    return Promise.resolve({ affected: 1 });
  });
  const repository = {
    create,
    save,
    update,
    findOne: jest.fn().mockResolvedValue(user),
  };
  const config = new ConfigService({
    NODE_ENV: 'test',
    EMAIL_VERIFICATION_REQUIRED: 'false',
  });
  const users = new UsersService(
    repository as unknown as Repository<User>,
    config,
  );
  return {
    user,
    create,
    save,
    update,
    users,
    controller: new UsersController(users),
    config,
  };
}

describe('member details persistence and visibility', () => {
  it('keeps validated signup contact fields through AuthService and saves existing entity columns', async () => {
    const { users, config, user, create } = fixture();
    const auth = new AuthService(
      users,
      {} as JwtService,
      config,
      {} as Repository<EmailVerification>,
    );
    await auth.signup(
      await validated(
        { ...signup, phone: '010-1234-1234', birthdate: '1998-01-01' },
        SignupDto,
      ),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: '01012341234',
        birthDate: new Date(1998, 0, 1),
      }),
    );
    expect(user.phoneNumber).toBe('01012341234');
    expect(user.birthDate).toEqual(new Date(1998, 0, 1));
  });

  it('updates only provided contact fields and can clear them explicitly', async () => {
    const { users, user, update } = fixture();
    await users.updateLocation(
      8,
      await validated({ phone: '090-1234-5678' }, UpdateProfileDto),
    );
    expect(update).toHaveBeenLastCalledWith(8, { phoneNumber: '09012345678' });
    expect(user.birthDate).toEqual(new Date(1990, 0, 2));
    await users.updateLocation(
      8,
      await validated({ nickname: '바꾼 닉네임' }, UpdateProfileDto),
    );
    expect(user.phoneNumber).toBe('09012345678');
    expect(user.birthDate).toEqual(new Date(1990, 0, 2));
    await users.updateLocation(
      8,
      await validated({ phone: null, birthdate: null }, UpdateProfileDto),
    );
    expect(update).toHaveBeenLastCalledWith(8, {
      phoneNumber: null,
      birthDate: null,
    });
    expect(user.phoneNumber).toBeNull();
    expect(user.birthDate).toBeNull();
  });

  it('exposes normalized contact details only in the authenticated profile', async () => {
    const { user, controller } = fixture();
    user.phoneNumber = '010-1234-1234';
    const profile = await controller.getProfile({
      user: { id: 8, email: user.email, nickname: user.nickname },
    });
    expect(profile).toEqual(
      expect.objectContaining({
        phone: '01012341234',
        birthdate: '1990-01-02',
      }),
    );
    const publicProfile = await controller.findOne(8);
    for (const field of ['phone', 'phoneNumber', 'birthdate', 'birthDate']) {
      expect(publicProfile).not.toHaveProperty(field);
    }
    user.phoneNumber = null;
    user.birthDate = null;
    expect(
      await controller.getProfile({
        user: { id: 8, email: user.email, nickname: user.nickname },
      }),
    ).toEqual(expect.objectContaining({ phone: null, birthdate: null }));
  });
});
