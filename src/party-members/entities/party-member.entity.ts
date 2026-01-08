import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Party } from '../../parties/entities/party.entity';
import { User } from '../../users/entities/user.entity';

@Entity('party_members')
export class PartyMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'party_id' })
  partyId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ default: 'PENDING' }) // PENDING | APPROVED | REJECTED
  status: string;

  @Column({ name: 'is_muted', default: false })
  isMuted: boolean;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // 관계 설정
  @ManyToOne(() => Party)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
