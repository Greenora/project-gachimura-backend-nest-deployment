const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? DEFAULT_FRONTEND_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin?: string): boolean {
  return !origin || corsOrigins().includes(origin);
}
