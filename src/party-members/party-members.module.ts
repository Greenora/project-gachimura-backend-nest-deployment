import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartyMembersService } from './party-members.service';
import { PartyMembersController } from './party-members.controller';
import { PartyMember } from './entities/party-member.entity';
import { Party } from '../parties/entities/party.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([PartyMember, Party]), AuthModule],
  controllers: [PartyMembersController],
  providers: [PartyMembersService],
})
export class PartyMembersModule {}
