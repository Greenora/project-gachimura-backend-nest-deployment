import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { PartyMember } from '../party-members/entities/party-member.entity';

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(PartyMember)
    private memberRepository: Repository<PartyMember>,
  ) {}

  private async ensureMember(partyId: number, userId: number) {
    const member = await this.memberRepository.findOne({
      where: { partyId, userId, status: 'APPROVED' },
    });
    if (!member) {
      throw new ForbiddenException('이 모임의 채팅을 이용할 수 없습니다.');
    }
  }

  async findAllByParty(partyId: number, userId: number) {
    await this.ensureMember(partyId, userId);

    return this.chatMessageRepository.find({
      where: { partyId },
      select: {
        id: true,
        partyId: true,
        senderId: true,
        content: true,
        messageType: true,
        createdAt: true,
        sender: {
          id: true,
          nickname: true,
          nickname_jp: true,
          profileImage: true,
        },
      },
      relations: {
        sender: true,
      },
      order: { createdAt: 'ASC' },
    });
  }

  async create(createChatMessageDto: CreateChatMessageDto, userId: number) {
    await this.ensureMember(createChatMessageDto.partyId, userId);

    const newMessage = this.chatMessageRepository.create({
      partyId: createChatMessageDto.partyId,
      senderId: userId,
      content: createChatMessageDto.content.trim(),
      messageType: 'TALK',
    });
    return this.chatMessageRepository.save(newMessage);
  }
}
