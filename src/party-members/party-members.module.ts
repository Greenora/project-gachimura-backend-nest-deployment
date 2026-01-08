import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartyMembersService } from './party-members.service';
import { PartyMembersController } from './party-members.controller';
import { PartyMember } from './entities/party-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PartyMember])],
  controllers: [PartyMembersController],
  providers: [PartyMembersService],
})
export class PartyMembersModule {}
