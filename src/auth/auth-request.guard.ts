import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { corsOrigins } from '../config/cors';

@Injectable()
export class AuthRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method))
      return true;

    const origin = request.headers.origin;
    const trustedOrigin =
      typeof origin === 'string' && corsOrigins().includes(origin);
    if (
      (origin !== undefined && !trustedOrigin) ||
      (origin === undefined &&
        request.headers['sec-fetch-site'] !== undefined &&
        request.headers['sec-fetch-site'] !== 'same-origin')
    ) {
      throw new ForbiddenException('허용되지 않은 인증 요청입니다.');
    }

    const contentType = request.headers['content-type'];
    const json =
      typeof contentType === 'string' &&
      contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json';
    const body: unknown = request.body;
    const emptyBody =
      body === undefined ||
      body === null ||
      (typeof body === 'object' &&
        !Array.isArray(body) &&
        Object.keys(body).length === 0);
    // Older open tabs refresh/logout without a JSON header; only trusted, empty requests qualify.
    const legacyEmptyRequest =
      trustedOrigin &&
      contentType === undefined &&
      ['refresh', 'logout'].includes(context.getHandler().name) &&
      (!request.headers['content-length'] ||
        request.headers['content-length'] === '0') &&
      !request.headers['transfer-encoding'] &&
      emptyBody;
    if (!json && !legacyEmptyRequest) {
      throw new UnsupportedMediaTypeException(
        '인증 요청은 JSON 형식으로 보내주세요.',
      );
    }
    return true;
  }
}
