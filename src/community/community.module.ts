import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { CommunityPost } from './entities/community-post.entity';
import { CommunityPostLike } from './entities/community-post-like.entity';
import { CommunityComment } from './entities/community-comment.entity';
import { Party } from '../parties/entities/party.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommunityPost,
      CommunityPostLike,
      CommunityComment,
      Party,
    ]),
  ],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
