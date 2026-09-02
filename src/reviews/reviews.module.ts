import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { Review } from './entities/review.entity';
import { User } from '../users/entities/user.entity';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, User, Party, PartyMember])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
