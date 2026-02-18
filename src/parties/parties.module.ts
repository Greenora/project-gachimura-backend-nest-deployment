import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { Party } from './entities/party.entity';
import { AuthModule } from 'src/auth/auth.module';
import { PartyMember } from '../party-members/entities/party-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Party, PartyMember]), AuthModule],
  controllers: [PartiesController],
  providers: [PartiesService],
})
export class PartiesModule {}
