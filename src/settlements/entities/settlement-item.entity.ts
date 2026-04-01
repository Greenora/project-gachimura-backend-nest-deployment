import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Settlement } from './settlement.entity';
import { SettlementItemMember } from './settlement-item-member.entity';

@Entity('settlement_items')
export class SettlementItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'settlement_id' })
  settlementId: number;

  @Column()
  name: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Settlement, (settlement) => settlement.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: Settlement;

  @OneToMany(() => SettlementItemMember, (sim) => sim.item, { cascade: true })
  members: SettlementItemMember[];
}
