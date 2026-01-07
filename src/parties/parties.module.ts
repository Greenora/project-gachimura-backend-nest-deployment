import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';

@Module({
  controllers: [PartiesController],
  providers: [PartiesService],
})
export class PartiesModule {}
