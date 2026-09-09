import { ConfigService } from '@nestjs/config';

const MIN_JWT_SECRET_LENGTH = 32;

export function requireJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET')?.trim();

  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters long`,
    );
  }

  return secret;
}
