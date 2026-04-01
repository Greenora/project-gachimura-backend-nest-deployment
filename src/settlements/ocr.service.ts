import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface OcrItem {
  name: string;
  price: number;
  quantity: number;
}

export interface OcrResult {
  storeName: string | null;
  items: OcrItem[];
  totalPrice: number | null;
}

interface OcrTextField {
  text?: string;
  formatted?: {
    value?: string;
  };
}

interface OcrPriceField {
  price?: OcrTextField;
  unitPrice?: OcrTextField;
}

interface OcrItemField {
  name?: OcrTextField;
  count?: OcrTextField;
  price?: OcrPriceField;
}

interface OcrReceiptResult {
  storeInfo?: {
    name?: OcrTextField;
  };
  totalPrice?: {
    price?: OcrTextField;
  };
  subResults?: Array<{
    items?: OcrItemField[];
  }>;
}

interface OcrResponseBody {
  images?: Array<{
    receipt?: {
      result?: OcrReceiptResult;
    };
  }>;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Naver CLOVA OCR 영수증 특화 모델 호출
   */
  async parseReceipt(filePath: string): Promise<OcrResult> {
    const secretKey = this.configService.get<string>('CLOVA_OCR_SECRET');
    const invokeUrl = this.configService.get<string>('CLOVA_OCR_INVOKE_URL');

    if (!secretKey || !invokeUrl || secretKey.startsWith('여기에')) {
      this.logger.warn(
        'CLOVA OCR API 키가 설정되지 않았습니다. .env 파일에 CLOVA_OCR_SECRET, CLOVA_OCR_INVOKE_URL을 설정해주세요.',
      );
      return { storeName: null, items: [], totalPrice: null };
    }

    const absolutePath = path.resolve(filePath);
    const imageData = fs.readFileSync(absolutePath);

    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const format = ['jpg', 'jpeg'].includes(ext) ? 'jpg' : ext;

    const requestMessage = {
      version: 'V2',
      requestId: randomUUID(),
      timestamp: Date.now(),
      images: [
        {
          format,
          name: 'receipt',
        },
      ],
    };

    const apiUrl = invokeUrl;

    const formData = new FormData();
    formData.append('message', JSON.stringify(requestMessage));
    formData.append('file', fs.createReadStream(absolutePath));

    this.logger.log(
      `OCR 요청 준비: format=${format}, bytes=${imageData.length}, requestId=${requestMessage.requestId}, url=${apiUrl}`,
    );

    try {
      const response = await axios.post(apiUrl, formData, {
        headers: {
          'X-OCR-SECRET': secretKey,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });

      return this.parseOcrResponse(response.data as OcrResponseBody);
    } catch (error: unknown) {
      const axiosError = error as {
        message?: string;
        response?: { status?: number; data?: unknown };
      };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      this.logger.error(
        `CLOVA OCR API 호출 실패: ${axiosError.message || 'unknown error'} (status=${status})`,
        data,
      );
      return { storeName: null, items: [], totalPrice: null };
    }
  }

  /**
   * CLOVA OCR 영수증 특화 모델 응답 파싱
   * 응답 구조: images[0].receipt.result
   */
  private parseOcrResponse(data: OcrResponseBody): OcrResult {
    const result: OcrResult = {
      storeName: null,
      items: [],
      totalPrice: null,
    };

    try {
      const receiptResult = data?.images?.[0]?.receipt?.result;
      if (!receiptResult) {
        this.logger.warn('OCR 응답에 영수증 데이터가 없습니다.');
        return result;
      }

      // 가게명
      result.storeName =
        receiptResult.storeInfo?.name?.formatted?.value ||
        receiptResult.storeInfo?.name?.text ||
        null;

      // 총 금액
      const totalText =
        receiptResult.totalPrice?.price?.formatted?.value ||
        receiptResult.totalPrice?.price?.text;
      if (totalText) {
        result.totalPrice = parseInt(
          String(totalText).replace(/[,\s원]/g, ''),
          10,
        );
      }

      // 품목 리스트
      const subResults = receiptResult.subResults || [];
      for (const sub of subResults) {
        const items = sub.items || [];
        for (const item of items) {
          const name =
            item.name?.formatted?.value || item.name?.text || '알 수 없는 품목';

          const priceText =
            item.price?.price?.formatted?.value ||
            item.price?.price?.text ||
            item.price?.unitPrice?.formatted?.value ||
            item.price?.unitPrice?.text ||
            '0';
          const price = parseInt(String(priceText).replace(/[,\s원]/g, ''), 10);

          const countText =
            item.count?.formatted?.value || item.count?.text || '1';
          const quantity =
            parseInt(String(countText).replace(/[^\d]/g, ''), 10) || 1;

          if (name && price > 0) {
            result.items.push({ name, price, quantity });
          }
        }
      }

      this.logger.log(
        `OCR 파싱 완료: ${result.storeName}, ${result.items.length}개 품목, 총 ${result.totalPrice}원`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`OCR 응답 파싱 실패: ${message}`);
    }

    return result;
  }
}
