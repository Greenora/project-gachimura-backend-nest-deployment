import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('parties')
export class Party {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'host_id' })
  hostId: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'thumbnail_image', nullable: true })
  thumbnailImage?: string;

  @Column({ name: 'store_name', nullable: true })
  storeName?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number;

  @Column({ name: 'meet_date', type: 'datetime', nullable: true })
  meetDate?: Date;

  @Column({ default: 'RECRUITING' }) // RECRUITING | SEALED | CLOSED
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'host_id' })
  host: User;
}
