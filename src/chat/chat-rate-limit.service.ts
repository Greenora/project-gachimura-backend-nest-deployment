import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, minutes } from '@nestjs/throttler';
import type { ThrottlerStorage } from '@nestjs/throttler';

export const CHAT_RATE_LIMIT_CODE = 'CHAT_RATE_LIMITED';
export const CHAT_RATE_LIMIT_MESSAGE =
  '메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 보내주세요.';

@Injectable()
export class ChatRateLimitService {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async consume(userId: number): Promise<void> {
    const key = `chat-user:${userId}`;
    // shortcut: 프로세스별 한도이며 서버를 여러 대로 늘리면 공유 저장소가 필요합니다.
    const result = await this.storage.increment(
      key,
      minutes(1),
      60,
      minutes(1),
      key,
    );
    if (result.isBlocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: CHAT_RATE_LIMIT_CODE,
          message: CHAT_RATE_LIMIT_MESSAGE,
          retryAfter: result.timeToBlockExpire,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
