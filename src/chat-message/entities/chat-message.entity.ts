import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Party } from '../../parties/entities/party.entity'; // 경로 확인 필요
import { User } from '../../users/entities/user.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'party_id' })
  partyId: number;

  @Column({ name: 'sender_id' })
  senderId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'message_type', default: 'TALK' })
  messageType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Party)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;
}