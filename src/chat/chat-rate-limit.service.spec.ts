import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import {
  CHAT_RATE_LIMIT_CODE,
  ChatRateLimitService,
} from './chat-rate-limit.service';

describe('account-wide chat limit storage', () => {
  let storage: ThrottlerStorageService;
  let limiter: ChatRateLimitService;

  beforeEach(() => {
    jest.useFakeTimers();
    storage = new ThrottlerStorageService();
    limiter = new ChatRateLimitService(storage);
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('allows sixty messages and rejects the next one without storing message content', async () => {
    for (let index = 0; index < 60; index++) await limiter.consume(1);
    await expect(limiter.consume(1)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: CHAT_RATE_LIMIT_CODE, retryAfter: 60 },
    });
    expect([...storage.storage.keys()]).toEqual(['chat-user:1']);
  });

  it('recovers after one minute without extending a different account quota', async () => {
    for (let index = 0; index < 60; index++) await limiter.consume(1);
    await expect(limiter.consume(1)).rejects.toBeInstanceOf(HttpException);
    await jest.advanceTimersByTimeAsync(30000);
    for (let index = 0; index < 60; index++) await limiter.consume(2);
    await jest.advanceTimersByTimeAsync(30001);
    await expect(limiter.consume(1)).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(30000);
    for (let index = 0; index < 60; index++) await limiter.consume(2);
    await expect(limiter.consume(2)).rejects.toBeInstanceOf(HttpException);
  });
});
