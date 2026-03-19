import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Settlement } from './settlement.entity';
import { User } from '../../users/entities/user.entity';

@Entity('settlement_payments')
@Index(['settlementId', 'userId'], { unique: true })
export class SettlementPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'settlement_id' })
  settlementId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'int', default: 0 })
  amount: number;

  // PENDING | PAID
  @Column({ default: 'PENDING' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Settlement)
  @JoinColumn({ name: 'settlement_id' })
  settlement: Settlement;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
