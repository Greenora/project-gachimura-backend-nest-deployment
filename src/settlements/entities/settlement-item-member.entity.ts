import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { SettlementItem } from './settlement-item.entity';
import { User } from '../../users/entities/user.entity';

@Entity('settlement_item_members')
@Index(['itemId', 'userId'], { unique: true })
export class SettlementItemMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'item_id' })
  itemId: number;

  @Column({ name: 'user_id' })
  userId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => SettlementItem, (item) => item.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: SettlementItem;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
