import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CommunityPost } from './community-post.entity';

@Entity('community_post_likes')
@Unique('uq_community_post_like_user_post', ['userId', 'postId'])
export class CommunityPostLike {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'post_id' })
  postId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CommunityPost)
  @JoinColumn({ name: 'post_id' })
  post: CommunityPost;
}
