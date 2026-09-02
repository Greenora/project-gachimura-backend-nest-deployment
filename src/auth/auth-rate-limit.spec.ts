import { AuthController } from './auth.controller';

const LIMIT_METADATA = 'THROTTLER:LIMITdefault';
const TTL_METADATA = 'THROTTLER:TTLdefault';

describe('AuthController rate limits', () => {
  it.each([
    ['login', 5, 60_000],
    ['sendEmailVerificationCode', 3, 600_000],
    ['verifyEmailVerificationCode', 5, 600_000],
    ['refresh', 10, 60_000],
  ] as const)(
    'limits %s requests',
    (methodName, expectedLimit, expectedTtl) => {
      const method = AuthController.prototype[methodName];

      expect(Reflect.getMetadata(LIMIT_METADATA, method)).toBe(expectedLimit);
      expect(Reflect.getMetadata(TTL_METADATA, method)).toBe(expectedTtl);
    },
  );
});
