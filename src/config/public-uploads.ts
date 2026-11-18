import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';

export function configurePublicUploads(app: NestExpressApplication): void {
  app.use(
    '/uploads',
    (request: Request, response: Response, next: NextFunction) => {
      // Receipts share this directory temporarily and must remain private.
      if (!/^\/\d+-\d+\.(?:jpe?g|png|webp)$/.test(request.path)) {
        response.sendStatus(404);
        return;
      }
      next();
    },
  );
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    index: false,
    redirect: false,
    dotfiles: 'deny',
    setHeaders: (response: Response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
}
