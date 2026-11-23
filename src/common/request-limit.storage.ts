import { ThrottlerStorageService } from '@nestjs/throttler';

export class RequestLimitStorage extends ThrottlerStorageService {
  override increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ) {
    // v6.5 clears timers by name when a block expires; keep other accounts' timers intact.
    return super.increment(key, ttl, limit, blockDuration, `${name}:${key}`);
  }
}
