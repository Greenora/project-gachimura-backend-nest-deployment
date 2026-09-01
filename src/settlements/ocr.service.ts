import { Injectable, Logger } from '@nestjs/common';
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
    if (!client) {
      return this.emptyResult();
    }

    const absolutePath = path.resolve(filePath);

    try {
      const [response] = await client.documentTextDetection({
        image: { content: fs.readFileSync(absolutePath) },
        imageContext: { languageHints: ['ko', 'en'] },
      });

      const annotation = response.fullTextAnnotation;
      const fullText = annotation?.text?.trim() ?? '';
      if (!fullText) {
        this.logger.warn('Google Vision 응답에 인식된 텍스트가 없습니다.');
        return this.emptyResult();
      }

      const visualLines = annotation
        ? this.extractVisualLines(annotation)
        : undefined;
      const result = parseReceiptText(fullText, visualLines);
      this.logger.log(
        `OCR 파싱 완료: ${result.storeName ?? '상호명 없음'}, ${result.items.length}개 품목, 총 ${result.totalPrice ?? 0}원`,
      );
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Google Vision OCR 호출 실패: ${message}`);
      return this.emptyResult();
    }
  }

  private getVisionClient(): ImageAnnotatorClient | null {
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
          !credentials.project_id ||
          !credentials.client_email ||
          !credentials.private_key
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
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.error(
          `GOOGLE_VISION_CREDENTIALS_BASE64 해석 실패: ${message}`,
        );
        return null;
      }
    }

    if (this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS')) {
      this.visionClient = new ImageAnnotatorClient();
      return this.visionClient;
    }

    this.logger.warn(
      'Google Vision 인증정보가 없습니다. .env.local에 GOOGLE_VISION_CREDENTIALS_BASE64를 설정해주세요.',
    );
    return null;
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
            const vertices = word.boundingBox?.vertices ?? [];
            if (!text || vertices.length === 0) {
              continue;
            }

            const xCoordinates = vertices.map((vertex) => vertex.x ?? 0);
            const yCoordinates = vertices.map((vertex) => vertex.y ?? 0);
            const minY = Math.min(...yCoordinates);
            const maxY = Math.max(...yCoordinates);
            words.push({
              text,
              x: Math.min(...xCoordinates),
              centerY: (minY + maxY) / 2,
              height: Math.max(maxY - minY, 1),
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
