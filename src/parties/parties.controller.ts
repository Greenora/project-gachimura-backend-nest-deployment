import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('party')
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  @ApiOperation({
    summary: '전체 모임 목록 조회',
    description: '생성된 모든 모임 목록을 가져옵니다.',
  })
  findAll() {
    return this.partiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: '특정 모임 조회',
    description: 'ID를 기반으로 특정 모임의 상세 정보를 가져옵니다.',
  })
  findOne(@Param('id') id: string) {
    return this.partiesService.findOne(+id);
  }

  @Post()
  @ApiOperation({
    summary: '모임 생성',
    description: '새로운 모임을 생성합니다.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('thumbnail_image'))
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreatePartyDto, @UploadedFile() file: any, @Req() req) {
    const hostId = req.user.id;
    return this.partiesService.createWithFile(dto, file, hostId);
  }
}
