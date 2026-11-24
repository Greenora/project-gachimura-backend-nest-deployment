import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

export function authEmailTracker(request: Record<string, unknown>): string {
  const body = request.body as { email?: unknown } | undefined;
  const email =
    body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';
  const identity =
    email && email.length <= 254
      ? `email:${email}`
      : `client:${String(request.ip)}`;
  return createHash('sha256').update(identity).digest('hex');
}

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(options: ThrottlerRequest): Promise<boolean> {
    // Keep a shared traffic ceiling without making every recipient share the mail retry budget.
    await super.handleRequest({
      ...options,
      limit: 60,
      ttl: 60_000,
      blockDuration: 60_000,
      throttler: { ...options.throttler, name: 'auth-traffic' },
      getTracker: (request) => String(request.ip),
      generateKey: (_context, tracker) =>
        createHash('sha256').update(`auth-traffic:${tracker}`).digest('hex'),
    });
    return super.handleRequest(options);
  }

  protected getErrorMessage(
    context: ThrottlerRequest['context'],
  ): Promise<string> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { cookie?: string } }>();
    const japanese = /(?:^|;\s*)language=japanese(?:;|$)/.test(
      request.headers.cookie || '',
    );
    return Promise.resolve(
      japanese
        ? 'しばらく待ってから、もう一度お試しください。'
        : '요청이 많아요. 잠시 후 다시 시도해주세요.',
    );
  }
}
