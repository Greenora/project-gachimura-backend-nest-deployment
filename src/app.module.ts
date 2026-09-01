import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/entities/user.entity';
import { PartiesModule } from './parties/parties.module';
import { Party } from './parties/entities/party.entity';
import { ChatMessageModule } from './chat-message/chat-message.module';
import { ChatMessage } from './chat-message/entities/chat-message.entity';
import { PartyMembersModule } from './party-members/party-members.module';
import { PartyMember } from './party-members/entities/party-member.entity';
import { ChatModule } from './chat/chat.module';
import { ReviewsModule } from './reviews/reviews.module';
import { Review } from './reviews/entities/review.entity';
import { SettlementsModule } from './settlements/settlements.module';
import { Settlement } from './settlements/entities/settlement.entity';
import { SettlementItem } from './settlements/entities/settlement-item.entity';
import { SettlementItemMember } from './settlements/entities/settlement-item-member.entity';
import { SettlementPayment } from './settlements/entities/settlement-payment.entity';
import { CommunityModule } from './community/community.module';
import { CommunityPost } from './community/entities/community-post.entity';
import { CommunityPostLike } from './community/entities/community-post-like.entity';
import { CommunityComment } from './community/entities/community-comment.entity';
import { EmailVerification } from './auth/entities/email-verification.entity';

@Module({
  imports: [
    // 환경변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    //DB 설정 (Async 방식 유지)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST') || 'localhost',
        port: configService.get<number>('DB_PORT') || 3306,
        username: configService.get<string>('DB_USERNAME') || 'root',
        password: configService.get<string>('DB_PASSWORD') || 'root',
        database: configService.get<string>('DB_NAME') || configService.get<string>('DB_DATABASE') || 'gachimura',
        entities: [
          User,
          Party,
          ChatMessage,
          PartyMember,
          Review,
          Settlement,
          SettlementItem,
          SettlementItemMember,
          SettlementPayment,
          CommunityPost,
          CommunityPostLike,
          CommunityComment,
          EmailVerification,
        ],
        synchronize: true,
        charset: 'utf8mb4',
      }),
    }),
    UsersModule,
    AuthModule, // (로그인)
    PartiesModule, // 팀원 (파티)
    ChatMessageModule, // 팀원 (채팅메시지)
    PartyMembersModule, // 팀원 (파티멤버)
    ChatModule, // 팀원 (채팅)
    ReviewsModule, // 추가 (후기)
    SettlementsModule, // 정산
    CommunityModule, // 커뮤니티
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
