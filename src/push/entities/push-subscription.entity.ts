import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('push_subscriptions')
@Index('UQ_push_subscriptions_endpoint_hash', ['endpointHash'], {
  unique: true,
})
@Index('IDX_push_subscriptions_user_id', ['userId'])
export class PushSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'endpoint_hash', type: 'char', length: 64 })
  endpointHash: string;

  @Column({ type: 'varchar', length: 4096 })
  endpoint: string;

  @Column({ type: 'varchar', length: 128 })
  p256dh: string;

  @Column({ type: 'varchar', length: 64 })
  auth: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_push_subscriptions_user',
  })
  user: User;
}
