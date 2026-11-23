import { RequestLimitStorage } from './request-limit.storage';

describe('independent request limit expiration', () => {
  let storage: RequestLimitStorage;

  beforeEach(() => {
    jest.useFakeTimers();
    storage = new RequestLimitStorage();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    jest.useRealTimers();
  });

  it.each(['default', 'auth-traffic'])(
    'does not cancel another account expiration when a %s block ends',
    async (name) => {
      const hit = (key: string) =>
        storage.increment(key, 600_000, 3, 600_000, name);
      for (let attempt = 0; attempt < 4; attempt++) await hit('a');
      await jest.advanceTimersByTimeAsync(590_000);
      await hit('b');
      await jest.advanceTimersByTimeAsync(10_001);
      expect((await hit('a')).isBlocked).toBe(false);
      await jest.advanceTimersByTimeAsync(590_000);
      for (let attempt = 0; attempt < 3; attempt++) {
        expect((await hit('b')).isBlocked).toBe(false);
      }
      expect((await hit('b')).isBlocked).toBe(true);
    },
  );
});
