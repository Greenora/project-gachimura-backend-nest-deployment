import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SettlementsService } from './settlements.service';
import { OcrService } from './ocr.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { UpdateSettlementItemsDto } from './dto/update-settlement-items.dto';
import { SelectItemsDto } from './dto/select-items.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';

interface AuthenticatedRequest {
  user: { id: number; email: string; nickname: string };
}

@ApiTags('Settlements')
@ApiBearerAuth('access-token')
@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly ocrService: OcrService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '정산 생성', description: '모임의 정산을 시작합니다 (호스트 전용)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSettlementDto) {
    return this.settlementsService.create(req.user.id, dto.partyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '정산 상세 조회' })
  findOne(@Param('id') id: string) {
    return this.settlementsService.findOne(+id);
  }

  @Get('party/:partyId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '파티 ID로 정산 조회' })
  findByPartyId(@Param('partyId') partyId: string) {
    return this.settlementsService.findByPartyId(+partyId);
  }

  @Patch(':id/items')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '정산 품목 업데이트', description: '호스트가 OCR 결과를 수정하고 저장합니다.' })
  updateItems(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettlementItemsDto,
  ) {
    return this.settlementsService.updateItems(+id, req.user.id, dto);
  }

  @Patch(':id/start')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '정산 시작하기', description: '멤버들이 품목을 선택할 수 있도록 상태를 변경합니다.' })
  startSelecting(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.startSelecting(+id, req.user.id);
  }

  @Patch(':id/select')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '품목 선택', description: '게스트가 본인이 구매한 품목을 선택합니다.' })
  selectItems(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: SelectItemsDto,
  ) {
    return this.settlementsService.selectItems(+id, req.user.id, dto);
  }

  @Patch(':id/revert')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '수정하기', description: 'SELECTING 상태를 DRAFT로 되돌려 품목을 수정합니다.' })
  revertToDraft(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.revertToDraft(+id, req.user.id);
  }

  @Patch(':id/confirm')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '정산 확정', description: '호스트가 최종 확정합니다.' })
  confirm(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.confirm(+id, req.user.id);
  }

  @Patch(':id/payment')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '입금 확인 처리', description: '호스트가 특정 멤버의 입금을 확인합니다.' })
  updatePayment(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.settlementsService.updatePayment(
      +id,
      req.user.id,
      dto.userId,
      dto.status,
    );
  }

  @Get(':id/payments')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: '입금 현황 조회' })
  getPayments(@Param('id') id: string) {
    return this.settlementsService.getPayments(+id);
  }

  @Post('upload-receipt')
  @UseGuards(AuthGuard('jwt'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '영수증 업로드 및 OCR 파싱' })
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(
            null,
            `receipt-${uniqueSuffix}${extname(file.originalname)}`,
          );
        },
      }),
    }),
  )
  async uploadReceipt(@UploadedFile() file: any) {
    if (!file) {
      return { message: '파일이 업로드되지 않았습니다.', items: [] };
    }

    const ocrResult = await this.ocrService.parseReceipt(file.path);

    // OCR 결과가 비어있으면 API 키 미설정 안내
    if (ocrResult.items.length === 0) {
      return {
        message: 'OCR 결과가 없습니다. CLOVA OCR API 키를 확인하거나 품목을 직접 입력해주세요.',
        filename: file.filename,
        storeName: null,
        items: [],
        totalPrice: null,
      };
    }

    return {
      message: '영수증 인식이 완료되었습니다.',
      filename: file.filename,
      storeName: ocrResult.storeName,
      items: ocrResult.items,
      totalPrice: ocrResult.totalPrice,
    };
  }
}
