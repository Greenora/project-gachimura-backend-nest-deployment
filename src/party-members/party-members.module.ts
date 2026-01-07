import { Module } from '@nestjs/common';
import { PartyMembersService } from './party-members.service';
import { PartyMembersController } from './party-members.controller';

@Module({
  controllers: [PartyMembersController],
  providers: [PartyMembersService],
})
export class PartyMembersModule {}
