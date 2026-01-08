import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('party')
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) { }

  @Get()
  @ApiOperation({ summary: '전체 모임 목록 조회', description: '생성된 모든 모임 목록을 가져옵니다.' })
  findAll() {
    return this.partiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 모임 조회', description: 'ID를 기반으로 특정 모임의 상세 정보를 가져옵니다.' })
  findOne(@Param('id') id: string) {
    return this.partiesService.findOne(+id);
  }
}
