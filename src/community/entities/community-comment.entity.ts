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
import { CommunityPost } from './community-post.entity';
import { DEFAULT_COMMUNITY_LOCALE } from '../community-locale.constants';
import type { CommunityLocale } from '../community-locale.constants';

@Entity('community_comments')
export class CommunityComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'post_id' })
  postId: number;

  @Column({ name: 'author_id' })
  authorId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 2, default: DEFAULT_COMMUNITY_LOCALE })
  locale: CommunityLocale;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CommunityPost)
  @JoinColumn({ name: 'post_id' })
  post: CommunityPost;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;
}
