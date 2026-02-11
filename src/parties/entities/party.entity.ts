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
import { User } from '../../users/entities/user.entity';
import { PartyMember } from '../../party-members/entities/party-member.entity';

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

  @Column({ default: 4 }) // 유저가 정한 최대 인원 수 (기본값 4)
  capacity: number;

  @Column({ default: 1, name: 'current_count' }) // 현재 참여 인원 수 (기본값 1, 호스트 포함)
  currentCount: number;

  @Column({ default: 'RECRUITING' }) // RECRUITING | SEALED | CLOSED
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'host_id' })
  host: User;

  @OneToMany(() => PartyMember, (partyMember) => partyMember.party) // 내가 이 파티에 참여했나? 확인
  partyMembers: PartyMember[];
}
