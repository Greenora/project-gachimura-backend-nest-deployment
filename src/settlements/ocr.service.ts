import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptText } from './receipt-parser';

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

interface GoogleServiceAccountCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

type OcrProviderFailureReason =
  | 'BILLING_DISABLED'
  | 'SERVICE_DISABLED'
  | 'IAM_PERMISSION_DENIED'
  | 'PERMISSION_DENIED'
  | 'UNAUTHENTICATED';

interface VisualWord {
  text: string;
  x: number;
  centerY: number;
  height: number;
}

interface VisualLine {
  centerY: number;
  height: number;
  words: VisualWord[];
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private visionClient: ImageAnnotatorClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Google Cloud Vision 문서 텍스트 인식 호출 후 영수증 텍스트를 구조화한다.
   */
  async parseReceipt(filePath: string): Promise<OcrResult> {
    const client = this.getVisionClient();
    const absolutePath = path.resolve(filePath);
    let content: Buffer;
    try {
      content = fs.readFileSync(absolutePath);
    } catch {
      throw this.unavailable('OCR_FILE_UNREADABLE');
    }
    let response: protos.google.cloud.vision.v1.IAnnotateImageResponse;
    try {
      [response] = await client.documentTextDetection({
        image: { content },
        imageContext: { languageHints: ['ko', 'en'] },
      });
    } catch (error: unknown) {
      throw this.providerFailure(error);
    }
    if (response.error?.code) {
      throw this.providerFailure(response.error);
    }
    const annotation = response.fullTextAnnotation;
    const fullText = annotation?.text?.trim() ?? '';
    if (!fullText) {
      this.logger.warn('OCR_NO_TEXT');
      return this.emptyResult();
    }
    const visualLines = annotation
      ? this.extractVisualLines(annotation)
      : undefined;
    const result = parseReceiptText(fullText, visualLines);
    this.logger.log(`OCR_RESULT items=${result.items.length}`);
    return result;
  }

  private unavailable(
    code: string,
    reason?: OcrProviderFailureReason,
  ): ServiceUnavailableException {
    this.logger.error(reason ? `${code} reason=${reason}` : code);
    return new ServiceUnavailableException({
      code,
      ...(reason ? { reason } : {}),
      message:
        '영수증 자동 인식 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하거나 품목을 직접 입력해주세요.',
    });
  }

  private providerFailure(
    error: unknown,
  ): BadGatewayException | ServiceUnavailableException {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
    if (code === 7 || code === 16) {
      const reason =
        error && typeof error === 'object' && 'reason' in error
          ? error.reason
          : undefined;
      const safeReason =
        reason === 'BILLING_DISABLED' ||
        reason === 'SERVICE_DISABLED' ||
        reason === 'IAM_PERMISSION_DENIED'
          ? reason
          : code === 16
            ? 'UNAUTHENTICATED'
            : 'PERMISSION_DENIED';
      return this.unavailable('OCR_AUTH_FAILED', safeReason);
    }
    if (
      [4, 14, 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(
        code as string | number,
      )
    ) {
      return this.unavailable('OCR_CONNECTION_FAILED');
    }
    this.logger.error('OCR_PROVIDER_ERROR');
    return new BadGatewayException({
      code: 'OCR_PROVIDER_ERROR',
      message:
        '영수증 자동 인식에 실패했습니다. 사진을 다시 선택하거나 품목을 직접 입력해주세요.',
    });
  }

  private getVisionClient(): ImageAnnotatorClient {
    if (this.visionClient) {
      return this.visionClient;
    }

    const encodedCredentials = this.configService.get<string>(
      'GOOGLE_VISION_CREDENTIALS_BASE64',
    );

    if (encodedCredentials) {
      try {
        const credentials = JSON.parse(
          Buffer.from(encodedCredentials.trim(), 'base64').toString('utf8'),
        ) as GoogleServiceAccountCredentials;

        if (
          typeof credentials?.project_id !== 'string' ||
          !credentials.project_id.trim() ||
          typeof credentials?.client_email !== 'string' ||
          !credentials.client_email.trim() ||
          typeof credentials?.private_key !== 'string' ||
          !credentials.private_key.trim()
        ) {
          throw new Error('서비스 계정 필수 필드가 없습니다.');
        }

        this.visionClient = new ImageAnnotatorClient({
          projectId: credentials.project_id,
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
          },
        });
        return this.visionClient;
      } catch {
        throw this.unavailable('OCR_INVALID_CREDENTIALS');
      }
    }

    if (this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS')) {
      try {
        this.visionClient = new ImageAnnotatorClient();
        return this.visionClient;
      } catch {
        throw this.unavailable('OCR_INVALID_CREDENTIALS');
      }
    }

    throw this.unavailable('OCR_NOT_CONFIGURED');
  }

  /**
   * Google의 문서 읽기 순서가 영수증 열을 섞는 경우가 있어 단어 좌표로
   * 실제 이미지의 가로줄을 다시 조립한다.
   */
  private extractVisualLines(
    annotation: protos.google.cloud.vision.v1.ITextAnnotation,
  ): string[] {
    const words: VisualWord[] = [];

    for (const page of annotation.pages ?? []) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const word of paragraph.words ?? []) {
            const text = (word.symbols ?? [])
              .map((symbol) => symbol.text ?? '')
              .join('');
            // 배경 무늬를 숫자로 오인한 낮은 신뢰도의 값은 정산에 사용하지 않는다.
            if (
              /^[\d,]+$/.test(text) &&
              word.confidence != null &&
              word.confidence < 0.5
            ) {
              continue;
            }
            const vertices = word.boundingBox?.vertices ?? [];
            if (!text || vertices.length === 0) {
              continue;
            }

            const xCoordinates = vertices.map((vertex) => vertex.x ?? 0);
            const yCoordinates = vertices.map((vertex) => vertex.y ?? 0);
            const minY = Math.min(...yCoordinates);
            const maxY = Math.max(...yCoordinates);
            const height = Math.max(maxY - minY, 1);
            let part = '';
            let partX = Math.min(...xCoordinates);
            let previousRight: number | undefined;
            for (const symbol of word.symbols ?? []) {
              const bounds = symbol.boundingBox?.vertices ?? [];
              const left = bounds.length
                ? Math.min(...bounds.map((vertex) => vertex.x ?? 0))
                : undefined;
              // SDK가 수량과 금액을 한 단어로 합쳐도 실제 열 사이의 간격은 남아 있다.
              if (
                part &&
                left != null &&
                previousRight != null &&
                left - previousRight > height * 0.8
              ) {
                words.push({
                  text: part,
                  x: partX,
                  centerY: (minY + maxY) / 2,
                  height,
                });
                part = '';
              }
              if (!part && left != null) partX = left;
              part += symbol.text ?? '';
              previousRight = bounds.length
                ? Math.max(...bounds.map((vertex) => vertex.x ?? 0))
                : undefined;
            }
            if (part)
              words.push({
                text: part,
                x: partX,
                centerY: (minY + maxY) / 2,
                height,
              });
          }
        }
      }
    }

    words.sort((a, b) => a.centerY - b.centerY || a.x - b.x);
    const lines: VisualLine[] = [];

    for (const word of words) {
      let line = lines.find(
        (candidate) =>
          Math.abs(candidate.centerY - word.centerY) <=
          Math.max(6, Math.min(candidate.height, word.height) * 0.55),
      );

      if (!line) {
        line = {
          centerY: word.centerY,
          height: word.height,
          words: [],
        };
        lines.push(line);
      }

      line.words.push(word);
      line.centerY =
        line.words.reduce((sum, current) => sum + current.centerY, 0) /
        line.words.length;
      line.height =
        line.words.reduce((sum, current) => sum + current.height, 0) /
        line.words.length;
    }

    return lines
      .sort((a, b) => a.centerY - b.centerY)
      .map((line) =>
        line.words
          .sort((a, b) => a.x - b.x)
          .map((word) => word.text)
          .join(' '),
      );
  }

  private emptyResult(): OcrResult {
    return { storeName: null, items: [], totalPrice: null };
  }
}
