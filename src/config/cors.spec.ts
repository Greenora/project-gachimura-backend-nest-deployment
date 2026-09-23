import { corsOrigins, isAllowedOrigin } from './cors';

it('only permits explicitly listed frontend origins', () => {
  const previous = process.env.CORS_ORIGINS;
  try {
    delete process.env.CORS_ORIGINS;
    expect(corsOrigins()).toEqual(['http://localhost:3000']);
    process.env.CORS_ORIGINS = 'https://example.com, http://localhost:3101, ';
    expect(corsOrigins()).toEqual([
      'https://example.com',
      'http://localhost:3101',
    ]);
    expect(isAllowedOrigin('https://example.com')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin()).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previous;
  }
});
