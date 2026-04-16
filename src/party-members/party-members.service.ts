import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartyMember } from './entities/party-member.entity';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class PartyMembersService {
  constructor(
    @InjectRepository(PartyMember)
    private partyMemberRepository: Repository<PartyMember>,
    private chatGateway: ChatGateway,
  ) {}

  findAllByParty(partyId: number) {
    return this.partyMemberRepository.find({
      where: { partyId },
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

  async create(partyId: number, userId: number) {
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

  async updateStatus(partyId: number, userId: number, status: string) {
    const member = await this.partyMemberRepository.findOne({
      where: { partyId, userId },
      relations: { user: true },
    });

    if (!member) {
      throw new Error('Member not found');
    }

    member.status = status;
    const saved = await this.partyMemberRepository.save(member);

    // 승인되었을 때 시스템 메시지 전송
    if (status === 'APPROVED') {
      const nicknameKo = member.user?.nickname || '알 수 없음';
      const nicknameJp = member.user?.nickname_jp || nicknameKo;
      this.chatGateway.sendSystemMessage(
        partyId,
        `__SYS__|JOIN|${encodeURIComponent(nicknameKo)}|${encodeURIComponent(nicknameJp)}`,
      );
    }

    return saved;
  }

  async remove(partyId: number, userId: number) {
    // 삭제 전 닉네임 확인용 조회
    const member = await this.partyMemberRepository.findOne({
      where: { partyId, userId },
      relations: { user: true },
    });

    if (member) {
      const nicknameKo = member.user?.nickname || '알 수 없음';
      const nicknameJp = member.user?.nickname_jp || nicknameKo;
      this.chatGateway.sendSystemMessage(
        partyId,
        `__SYS__|LEAVE|${encodeURIComponent(nicknameKo)}|${encodeURIComponent(nicknameJp)}`,
      );
    }

    return this.partyMemberRepository.delete({ partyId, userId });
  }
}
