import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('party')
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) { }

  @Get()
  @ApiOperation({
    summary: '전체 모임 목록 조회',
    description: '생성된 모든 모임 목록을 가져옵니다. 검색(?search=), 정렬(?sort=latest|imminent), 만료포함(?completed=true|false) 필터를 지원합니다.',
  })
  findAll(
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('completed') completed?: string,
  ) {
    const showCompleted = completed !== 'false'; // 기본값은 true (보여줌)
    return this.partiesService.findAll(search, sort, showCompleted);
  }

  @Get(':id')
  @ApiOperation({
    summary: '특정 모임 조회',
    description: 'ID를 기반으로 특정 모임의 상세 정보를 가져옵니다.',
  })
  findOne(@Param('id') id: string) {
    return this.partiesService.findOne(+id);
  }
}
