import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { promises as fs } from 'fs';
import { diskStorage, type Options } from 'multer';
import { extname } from 'path';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const THUMBNAIL_MAX_SIZE = 5 * 1024 * 1024;
export const RECEIPT_MAX_SIZE = 10 * 1024 * 1024;

export function imageUploadOptions(
  maxFileSize: number,
  filenamePrefix = '',
): Options {
  return {
    storage: diskStorage({
      destination: './uploads',
      filename: (
        _request: Express.Request,
        file: Express.Multer.File,
        callback: (error: Error | null, filename: string) => void,
      ) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        callback(
          null,
          `${filenamePrefix}${uniqueSuffix}${extname(file.originalname).toLowerCase()}`,
        );
      },
    }),
    limits: { fileSize: maxFileSize, files: 1 },
    fileFilter: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      const isAllowed =
        ALLOWED_IMAGE_EXTENSIONS.has(extension) &&
        ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);

      if (!isAllowed) {
        callback(
          new BadRequestException(
            'JPG, PNG, WebP 이미지만 업로드할 수 있습니다.',
          ),
        );
        return;
      }

      callback(null, true);
    },
  };
}

export function detectImageMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

@Injectable()
export class ImageFileValidationPipe implements PipeTransform<
  Express.Multer.File | undefined
> {
  async transform(
    file?: Express.Multer.File,
  ): Promise<Express.Multer.File | undefined> {
    if (!file) {
      return undefined;
    }

    let buffer: Buffer;
    try {
      const handle = await fs.open(file.path, 'r');
      try {
        buffer = Buffer.alloc(12);
        await handle.read(buffer, 0, buffer.length, 0);
      } finally {
        await handle.close();
      }
    } catch {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException('업로드한 파일을 확인할 수 없습니다.');
    }

    const detectedMimeType = detectImageMimeType(buffer);
    if (!detectedMimeType || detectedMimeType !== file.mimetype) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException('파일 내용이 올바른 이미지가 아닙니다.');
    }

    return file;
  }
}
