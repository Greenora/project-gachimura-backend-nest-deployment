import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { catchError, Observable } from 'rxjs';

export type PersistedUpload = Express.Multer.File & { persisted?: boolean };

@Injectable()
export class FailedUploadCleanupInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FailedUploadCleanupInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ file?: PersistedUpload }>();
    return next.handle().pipe(
      catchError(async (error: unknown) => {
        const file = request.file;
        // DTO validation can fail after Multer writes the file, before the controller runs.
        if (file && !file.persisted) {
          try {
            await fs.unlink(file.path);
          } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
              this.logger.warn('UPLOAD_CLEANUP_FAILED');
            }
          }
        }
        throw error;
      }),
    );
  }
}
