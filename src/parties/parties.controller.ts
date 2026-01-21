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
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

@ApiTags('party')
@ApiBearerAuth('access-token')
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
  @UseInterceptors(
    FileInterceptor('thumbnail_image', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          const uploadPath = './uploads';
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
          }
          callback(null, uploadPath);
        },
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreatePartyDto, @UploadedFile() file: any, @Req() req) {
    const hostId = req.user.id;
    return this.partiesService.createWithFile(dto, file, hostId);
  }
}
