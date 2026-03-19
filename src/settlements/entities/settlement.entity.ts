import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Party } from '../../parties/entities/party.entity';
import { User } from '../../users/entities/user.entity';
import { SettlementItem } from './settlement-item.entity';

@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'party_id' })
  partyId: number;

  @Column({ name: 'host_id' })
  hostId: number;

  // DRAFT: 호스트가 항목 편집 중
  // SELECTING: 멤버들이 항목 선택 중
  // CONFIRMED: 호스트 최종 확정
  // COMPLETED: 정산 완료
  @Column({ default: 'DRAFT' })
  status: string;

  @Column({ name: 'total_amount', type: 'int', default: 0 })
  totalAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Party)
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'host_id' })
  host: User;

  @OneToMany(() => SettlementItem, (item) => item.settlement, { cascade: true })
  items: SettlementItem[];
}
