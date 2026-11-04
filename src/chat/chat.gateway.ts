import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../chat-message/entities/chat-message.entity';
import { AuthService } from '../auth/auth.service';
import { isAllowedOrigin } from '../config/cors';
import { PushService } from '../push/push.service';

interface ClientChatPayload {
  partyId: number;
  message: string;
}

interface JoinRoomPayload {
  partyId: number;
}

type ChatAcknowledgement = { ok: true } | { ok: false; error: string };

interface AuthenticatedSocketData {
  user?: {
    id: number;
  };
}

import { PartyMember } from '../party-members/entities/party-member.entity';

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed: boolean) => void,
    ) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  // WebSocket handshakes do not enforce browser CORS; validate Origin here too.
  allowRequest: (
    request: { headers: { origin?: string } },
    callback: (error: string | null, allowed: boolean) => void,
  ) => callback(null, isAllowedOrigin(request.headers.origin)),
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  // DB 저장을 위해 Repository 주입
  constructor(
    @InjectRepository(ChatMessage)
    private chatRepository: Repository<ChatMessage>,
    @InjectRepository(PartyMember)
    private memberRepository: Repository<PartyMember>,
    private authService: AuthService,
    private pushService: PushService,
  ) {}

  private reject(client: Socket, error: string): ChatAcknowledgement {
    client.emit('error', error);
    return { ok: false, error };
  }

  handleConnection(client: Socket): void {
    const authToken = (
      client.handshake.auth as Record<string, unknown> | undefined
    )?.token;
    const cookieToken = client.handshake.headers.cookie?.match(
      /(?:^|;\s*)accessToken=([^;]+)/,
    )?.[1];
    try {
      const token =
        typeof authToken === 'string'
          ? authToken
          : cookieToken
            ? decodeURIComponent(cookieToken)
            : undefined;
      if (typeof token !== 'string' || !token) {
        client.emit('error', '채팅 연결에 인증 토큰이 필요합니다.');
        client.disconnect(true);
        return;
      }
      const payload = this.authService.verifyAccessToken(token);
      const socketData = client.data as AuthenticatedSocketData;
      socketData.user = {
        id: payload.sub,
      };
    } catch {
      client.emit('error', '채팅 인증에 실패했습니다.');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomPayload | undefined,
    @ConnectedSocket() client: Socket,
  ): Promise<ChatAcknowledgement> {
    const socketData = client.data as AuthenticatedSocketData;
    const userId = socketData.user?.id;
    if (
      typeof userId !== 'number' ||
      typeof data?.partyId !== 'number' ||
      !Number.isInteger(data.partyId) ||
      data.partyId < 1
    ) {
      const reply = this.reject(client, '올바르지 않은 채팅방 요청입니다.');
      client.disconnect(true);
      return reply;
    }

    try {
      const member = await this.memberRepository.findOne({
        where: {
          partyId: data.partyId,
          userId,
          status: 'APPROVED',
        },
      });
      if (!member) {
        return this.reject(client, '해당 모임의 멤버가 아닙니다.');
      }
      const roomName = `party_${data.partyId}`;
      await client.join(roomName);
      return { ok: true };
    } catch {
      return this.reject(
        client,
        '채팅방에 입장하지 못했습니다. 다시 시도해주세요.',
      );
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() payload: ClientChatPayload | undefined,
    @ConnectedSocket() client: Socket,
  ): Promise<ChatAcknowledgement> {
    const socketData = client.data as AuthenticatedSocketData;
    const userId = socketData.user?.id;
    if (
      typeof userId !== 'number' ||
      typeof payload?.partyId !== 'number' ||
      !Number.isInteger(payload.partyId) ||
      payload.partyId < 1 ||
      typeof payload.message !== 'string' ||
      !payload.message.trim() ||
      payload.message.length > 2000
    ) {
      return this.reject(client, '올바르지 않은 채팅 메시지입니다.');
    }

    const roomName = `party_${payload.partyId}`;
    if (!client.rooms.has(roomName)) {
      return this.reject(client, '채팅방에 먼저 입장해주세요.');
    }

    try {
      const member = await this.memberRepository.findOne({
        where: {
          partyId: payload.partyId,
          userId,
          status: 'APPROVED',
        },
        relations: { user: true },
      });
      if (!member) {
        return this.reject(client, '해당 모임의 멤버가 아닙니다.');
      }
      const message = payload.message.trim();
      const newChat = this.chatRepository.create({
        partyId: payload.partyId,
        senderId: userId,
        content: message,
        messageType: 'TALK',
      });
      const savedChat = await this.chatRepository.save(newChat);
      this.server.to(roomName).emit('message', {
        userId,
        partyId: payload.partyId,
        message,
        nickname: member.user.nickname,
        nickname_jp: member.user.nickname_jp,
        profileImage: member.user.profileImage ?? null,
        messageType: 'TALK',
        createdAt:
          savedChat.createdAt?.toISOString() || new Date().toISOString(),
      });
      void this.pushService
        .notifyParty(payload.partyId, userId)
        .catch(() => undefined);
      return { ok: true };
    } catch {
      return this.reject(
        client,
        '메시지를 저장하지 못했습니다. 다시 시도해주세요.',
      );
    }
  }

  // 외부 서비스에서 시스템 메시지를 보낼 수 있게 하는 메서드
  async sendSystemMessage(partyId: number, message: string) {
    // 1. DB에 저장
    const systemChat = this.chatRepository.create({
      partyId,
      senderId: null, // 시스템 메시지는 발신자가 없음
      content: message,
      messageType: 'SYSTEM',
    });
    const savedChat = await this.chatRepository.save(systemChat);

    // 2. 해당 채에 전송
    const roomName = `party_${partyId}`;
    this.server.to(roomName).emit('message', {
      userId: 0,
      partyId: partyId,
      message: message,
      nickname: '시스템',
      messageType: 'SYSTEM',
      createdAt: savedChat.createdAt?.toISOString() || new Date().toISOString(),
    });
  }
}
