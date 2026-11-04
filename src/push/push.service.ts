import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createECDH, createHash, ECDH } from 'node:crypto';
import { In, Not, Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { User } from '../users/entities/user.entity';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { PushSubscription } from './entities/push-subscription.entity';

function keyBytes(value: string, length: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    throw new Error('INVALID_PUSH_KEY');
  }
  const bytes = Buffer.from(value, 'base64url');
  if (
    bytes.length !== length ||
    bytes.toString('base64url') !== value.replace(/=+$/, '')
  ) {
    throw new Error('INVALID_PUSH_KEY');
  }
  return bytes;
}

function validEndpoint(endpoint: string): void {
  try {
    if (endpoint.length > 4096 || /\s/.test(endpoint)) throw new Error();
    const url = new URL(endpoint);
    const host = url.hostname;
    const allowed =
      host === 'fcm.googleapis.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com');
    if (
      !allowed ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new BadRequestException('지원하지 않는 알림 수신 주소입니다.');
  }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapid: NonNullable<
    webpush.RequestOptions['vapidDetails']
  > | null;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    @InjectRepository(PartyMember)
    private readonly members: Repository<PartyMember>,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('WEB_PUSH_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('WEB_PUSH_PRIVATE_KEY')?.trim();
    const subject =
      config.get<string>('WEB_PUSH_SUBJECT')?.trim() || 'https://gachimura.com';
    this.vapid = null;
    if (!publicKey || !privateKey) return;
    try {
      const url = new URL(subject);
      if (
        !['https:', 'mailto:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+$/.test(url.pathname))
      ) {
        throw new Error();
      }
      const publicBytes = keyBytes(publicKey, 65);
      const curve = createECDH('prime256v1');
      curve.setPrivateKey(keyBytes(privateKey, 32));
      if (!curve.getPublicKey().equals(publicBytes)) throw new Error();
      this.vapid = { subject, publicKey, privateKey };
    } catch {
      this.logger.warn('PUSH_CONFIG_INVALID');
    }
  }

  getConfig() {
    return {
      enabled: this.vapid !== null,
      publicKey: this.vapid?.publicKey ?? null,
    };
  }

  async subscribe(userId: number, input: CreatePushSubscriptionDto) {
    if (!this.vapid) {
      throw new ServiceUnavailableException(
        '알림 서비스가 아직 준비되지 않았습니다.',
      );
    }
    validEndpoint(input.endpoint);
    try {
      const publicKey = keyBytes(input.keys.p256dh, 65);
      if (publicKey[0] !== 4) throw new Error();
      ECDH.convertKey(publicKey, 'prime256v1');
      keyBytes(input.keys.auth, 16);
    } catch {
      throw new BadRequestException('알림 수신 정보를 확인할 수 없습니다.');
    }
    const endpointHash = createHash('sha256')
      .update(input.endpoint)
      .digest('hex');
    try {
      await this.subscriptions.manager.transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { id: userId },
          select: { id: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new UnauthorizedException();
        const subscriptions = manager.getRepository(PushSubscription);
        const existing = await subscriptions.findOneBy({ endpointHash });
        if (existing?.userId !== userId) {
          if ((await subscriptions.countBy({ userId })) >= 10) {
            throw new BadRequestException(
              '연결할 수 있는 알림 기기 수를 초과했습니다.',
            );
          }
          if (
            existing &&
            (existing.p256dh !== input.keys.p256dh ||
              existing.auth !== input.keys.auth)
          ) {
            throw new BadRequestException(
              '알림 수신 정보를 확인할 수 없습니다.',
            );
          }
        }
        await subscriptions.save(
          subscriptions.create({
            ...existing,
            userId,
            endpointHash,
            endpoint: input.endpoint,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
          }),
        );
      });
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.warn('PUSH_STORAGE_UNAVAILABLE');
      throw new ServiceUnavailableException(
        '알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
    return { subscribed: true };
  }

  async unsubscribe(userId: number, endpoint: string) {
    validEndpoint(endpoint);
    try {
      await this.subscriptions.delete({
        userId,
        endpointHash: createHash('sha256').update(endpoint).digest('hex'),
      });
    } catch {
      this.logger.warn('PUSH_STORAGE_UNAVAILABLE');
      throw new ServiceUnavailableException(
        '알림 설정을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
    return { subscribed: false };
  }

  async notifyParty(partyId: number, senderId: number): Promise<void> {
    if (!this.vapid) return;
    try {
      const members = await this.members.find({
        where: {
          partyId,
          status: 'APPROVED',
          isMuted: false,
          userId: Not(senderId),
        },
        select: { userId: true },
      });
      const recipients = [...new Set(members.map((member) => member.userId))];
      if (!recipients.length) return;
      const subscriptions = await this.subscriptions.findBy({
        userId: In(recipients),
      });
      await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          try {
            // The worker supplies fixed copy; chat and bank details never leave in push payloads.
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({ partyId }),
              {
                vapidDetails: this.vapid!,
                TTL: 3600,
                timeout: 5000,
                urgency: 'normal',
              },
            );
          } catch (error: unknown) {
            const status =
              error &&
              typeof error === 'object' &&
              'statusCode' in error &&
              typeof error.statusCode === 'number'
                ? error.statusCode
                : 0;
            if (status === 404 || status === 410) {
              await this.subscriptions.delete({
                id: subscription.id,
                userId: subscription.userId,
              });
            } else {
              this.logger.warn(
                `PUSH_DELIVERY_FAILED status=${Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0}`,
              );
            }
          }
        }),
      );
    } catch {
      this.logger.warn('PUSH_STORAGE_UNAVAILABLE');
    }
  }
}
