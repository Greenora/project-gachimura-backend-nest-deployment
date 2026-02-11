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
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('parties')
@ApiBearerAuth('access-token')
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) { }

  @Get()
  @ApiOperation({
    summary: '모든 모임 조회 (검색/정렬/필터)',
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
  @ApiOperation({ summary: '특정 모임 상세 조회' })
  findOne(@Param('id') id: string) {
    return this.partiesService.findOne(+id);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: '특정 유저가 만든 모임 목록 조회' })
  findAllByUser(@Param('userId') userId: string) {
    return this.partiesService.findAllByUser(+userId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '새 모임 생성',
    description: '새로운 장보기 모임을 생성합니다.',
  })
  @UseInterceptors(
    FileInterceptor('thumbnail_image', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  create(
    @Req() req: any,
    @Body() createPartyDto: CreatePartyDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const hostId = req.user.id;
    return this.partiesService.createWithFile(createPartyDto, file, hostId);
  }
}
