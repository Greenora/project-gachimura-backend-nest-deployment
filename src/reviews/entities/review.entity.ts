import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Party } from '../../parties/entities/party.entity';

@Entity('evaluations')
@Index(['partyId', 'reviewerId', 'revieweeId'], { unique: true }) // 중복 평가 방지
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'party_id' })
  partyId: number;

  @Column({ name: 'reviewer_id' })
  reviewerId: number;

  @Column({ name: 'reviewee_id' })
  revieweeId: number;

  @Column()
  score: number; // -4, -2, 0, 2, 4

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Party)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewee_id' })
  reviewee: User;
}
