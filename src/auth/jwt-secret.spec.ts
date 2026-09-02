import { ConfigService } from '@nestjs/config';
import { requireJwtSecret } from './jwt-secret';

describe('requireJwtSecret', () => {
  it('returns a configured secret', () => {
    const configService = {
      get: jest.fn().mockReturnValue('a'.repeat(48)),
    } as unknown as ConfigService;

    expect(requireJwtSecret(configService)).toHaveLength(48);
  });

  it.each([undefined, '', 'short-secret'])(
    'rejects an unsafe secret',
    (secret) => {
      const configService = {
        get: jest.fn().mockReturnValue(secret),
      } as unknown as ConfigService;

      expect(() => requireJwtSecret(configService)).toThrow(
        'JWT_SECRET must be set and at least 32 characters long',
      );
    },
  );
});
