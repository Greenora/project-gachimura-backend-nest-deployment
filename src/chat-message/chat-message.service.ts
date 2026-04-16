import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
  ) {}

  findAllByParty(partyId: number) {
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

  create(createChatMessageDto: CreateChatMessageDto) {
    const newMessage = this.chatMessageRepository.create(createChatMessageDto);
    return this.chatMessageRepository.save(newMessage);
  }
}
