import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { configurePublicUploads } from './public-uploads';

describe('public party thumbnails', () => {
  let app: NestExpressApplication;
  let directory: string;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gachimura-public-uploads-'));
    const uploads = join(directory, 'uploads');
    await mkdir(uploads);
    for (const extension of ['jpg', 'jpeg', 'png', 'webp']) {
      await writeFile(join(uploads, `1730000000000-123.${extension}`), jpeg);
    }
    for (const filename of [
      'receipt-1730000000000-123.jpg',
      '.env',
      '1730000000000-123.txt',
      '1730000000000-123.svg',
      'arbitrary.jpg',
    ]) {
      await writeFile(join(uploads, filename), 'private fixture');
    }
    await writeFile(join(directory, 'private.txt'), 'outside uploads');
    const fixture = await Test.createTestingModule({}).compile();
    app = fixture.createNestApplication<NestExpressApplication>();
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(directory);
    try {
      configurePublicUploads(app);
    } finally {
      cwd.mockRestore();
    }
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each(['jpg', 'jpeg', 'png', 'webp'])(
    'serves generated %s thumbnails publicly outside the API prefix',
    async (extension) => {
      const result = await request(app.getHttpServer())
        .get(`/uploads/1730000000000-123.${extension}`)
        .expect(200)
        .expect('Content-Type', /^image\//)
        .expect('X-Content-Type-Options', 'nosniff');
      expect(result.body).toEqual(jpeg);
      await request(app.getHttpServer())
        .get(`/api/uploads/1730000000000-123.${extension}`)
        .expect(404);
    },
  );

  it.each([
    '/uploads/receipt-1730000000000-123.jpg',
    '/uploads/.env',
    '/uploads/1730000000000-123.txt',
    '/uploads/1730000000000-123.svg',
    '/uploads/arbitrary.jpg',
    '/uploads/%2e%2e%2fprivate.txt',
    '/uploads/..%2fprivate.txt',
    '/uploads/%252e%252e%252fprivate.txt',
    '/uploads/1730000000000-123.jpg/extra',
    '/uploads/',
    '/uploads/1730000000000-999.jpg',
  ])('does not expose private or invalid paths: %s', async (path) => {
    const result = await request(app.getHttpServer()).get(path).expect(404);
    expect(result.text).not.toContain('private fixture');
    expect(result.text).not.toContain('outside uploads');
    expect(result.text).not.toContain(directory);
  });
});
