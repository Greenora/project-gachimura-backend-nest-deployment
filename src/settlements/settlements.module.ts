import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { OcrService } from './ocr.service';
import { Settlement } from './entities/settlement.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Settlement,
      SettlementItem,
      SettlementItemMember,
      SettlementPayment,
      Party,
      PartyMember,
    ]),
    AuthModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, OcrService],
})
export class SettlementsModule {}
