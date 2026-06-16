import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Party } from '../../parties/entities/party.entity';
import { DEFAULT_COMMUNITY_LOCALE } from '../community-locale.constants';
import type { CommunityLocale } from '../community-locale.constants';

@Entity('community_posts')
export class CommunityPost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'author_id' })
  authorId: number;

  @Column({ name: 'linked_party_id', type: 'int', nullable: true })
  linkedPartyId?: number | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 2, default: DEFAULT_COMMUNITY_LOCALE })
  locale: CommunityLocale;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ManyToOne(() => Party, { nullable: true })
  @JoinColumn({ name: 'linked_party_id' })
  linkedParty?: Party | null;
}
