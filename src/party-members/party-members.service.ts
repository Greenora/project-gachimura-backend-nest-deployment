import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartyMember } from './entities/party-member.entity';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { toPublicUser } from '../users/user-response.mapper';

@Injectable()
export class PartyMembersService {
  constructor(
    @InjectRepository(PartyMember)
    private partyMemberRepository: Repository<PartyMember>,
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
    private chatGateway: ChatGateway,
  ) {}

  private async findPartyOrThrow(partyId: number) {
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });
    if (!party) {
      throw new NotFoundException('해당 모임을 찾을 수 없습니다.');
    }
    return party;
  }

  private async ensureHost(partyId: number, requesterId: number) {
    const party = await this.findPartyOrThrow(partyId);
    if (party.hostId !== requesterId) {
      throw new ForbiddenException('모임 멤버를 관리할 권한이 없습니다.');
    }
    return party;
  }

  async findAllByParty(partyId: number, requesterId: number) {
    const party = await this.findPartyOrThrow(partyId);
    const isHost = party.hostId === requesterId;
    if (!isHost) {
      const member = await this.partyMemberRepository.findOne({
        where: { partyId, userId: requesterId, status: 'APPROVED' },
      });
      if (!member) {
        throw new ForbiddenException('이 모임의 멤버가 아닙니다.');
      }
    }

    return this.partyMemberRepository.find({
      where: isHost ? { partyId } : { partyId, status: 'APPROVED' },
      select: {
        id: true,
        partyId: true,
        userId: true,
        status: true,
        isMuted: true,
        joinedAt: true,
        user: {
          id: true,
          nickname: true,
          nickname_jp: true,
          profileImage: true,
        },
      },
      relations: {
        user: true,
      },
    });
  }

  async create(partyId: number, userId: number, requesterId: number) {
    if (userId !== requesterId) {
      throw new ForbiddenException('다른 사용자를 대신해 가입할 수 없습니다.');
    }

    const party = await this.findPartyOrThrow(partyId);
    if (party.hostId === userId) {
      throw new BadRequestException('본인이 생성한 모임입니다.');
    }
    if (party.status !== 'RECRUITING') {
      throw new BadRequestException('현재 모집 중이 아닌 모임입니다.');
    }

    // 이미 존재하는지 확인
    const existing = await this.partyMemberRepository.findOne({
      where: { partyId, userId },
    });

    if (existing) {
      return existing;
    }

    const newMember = this.partyMemberRepository.create({
      partyId,
      userId,
      status: 'PENDING',
    });

    return this.partyMemberRepository.save(newMember);
  }

  private async syncPartyCurrentCount(partyId: number) {
    const count = await this.partyMemberRepository.count({
      where: { partyId, status: 'APPROVED' },
    });
    await this.partyRepository.update(partyId, { currentCount: count });
  }

  async updateStatus(
    partyId: number,
    userId: number,
    status: string,
    requesterId: number,
  ) {
    const party = await this.ensureHost(partyId, requesterId);
    if (party.hostId === userId) {
      throw new BadRequestException('방장의 멤버 상태는 변경할 수 없습니다.');
    }

    const member = await this.partyMemberRepository.findOne({
      where: { partyId, userId },
      relations: { user: true },
    });

    if (!member) {
      throw new NotFoundException('해당 모임 멤버를 찾을 수 없습니다.');
    }

    const previousStatus = member.status;
    member.status = status;
    const saved = await this.partyMemberRepository.save(member);

    if (previousStatus !== status) {
      await this.syncPartyCurrentCount(partyId);
    }

    // 승인되었을 때 시스템 메시지 전송
    if (status === 'APPROVED' && previousStatus !== 'APPROVED') {
      const nicknameKo = member.user?.nickname || '알 수 없음';
      const nicknameJp = member.user?.nickname_jp || nicknameKo;
      await this.chatGateway.sendSystemMessage(
        partyId,
        `__SYS__|JOIN|${encodeURIComponent(nicknameKo)}|${encodeURIComponent(nicknameJp)}`,
      );
    }

    return {
      ...saved,
      user: toPublicUser(saved.user),
    };
  }

  async remove(partyId: number, userId: number, requesterId: number) {
    const party = await this.ensureHost(partyId, requesterId);
    if (party.hostId === userId) {
      throw new BadRequestException('방장은 모임에서 강퇴할 수 없습니다.');
    }

    // 삭제 전 닉네임 확인용 조회
    const member = await this.partyMemberRepository.findOne({
      where: { partyId, userId },
      relations: { user: true },
    });

    if (member?.status === 'APPROVED') {
      const nicknameKo = member.user?.nickname || '알 수 없음';
      const nicknameJp = member.user?.nickname_jp || nicknameKo;
      await this.chatGateway.sendSystemMessage(
        partyId,
        `__SYS__|LEAVE|${encodeURIComponent(nicknameKo)}|${encodeURIComponent(nicknameJp)}`,
      );
    }

    const deleteResult = await this.partyMemberRepository.delete({
      partyId,
      userId,
    });
    if (member?.status === 'APPROVED') {
      await this.syncPartyCurrentCount(partyId);
    }
    return deleteResult;
  }
}
