import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { promises as fs } from 'node:fs';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PartiesController } from './parties.controller';
import { PartiesService } from './parties.service';
import type { PersistedUpload } from '../common/failed-upload-cleanup.interceptor';

describe('party upload request cleanup', () => {
  const secret = 'party-upload-fixture-only-'.repeat(3);
  const jwt = new JwtService({ secret });
  const token = (id: number) =>
    jwt.sign(
      { sub: id, email: `fixture-${id}@example.test`, nickname: 'Fixture' },
      { expiresIn: '1h' },
    );
  const png = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
  let app: INestApplication<Server>;
  let originalFiles: string[];
  const retainedFiles = new Set<string>();
  const create = jest.fn();

  beforeEach(async () => {
    await fs.mkdir('uploads', { recursive: true });
    originalFiles = (await fs.readdir('uploads')).sort();
    create
      .mockReset()
      .mockImplementation(
        (_dto: unknown, file: PersistedUpload | undefined, hostId: number) => {
          if (file) {
            file.persisted = true;
            retainedFiles.add(file.path);
          }
          return Promise.resolve({
            id: 8,
            hostId,
            thumbnailImage: file?.filename ?? null,
          });
        },
      );
    const fixture = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }])],
      controllers: [PartiesController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        { provide: PartiesService, useValue: { createWithFile: create } },
      ],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    for (const path of retainedFiles)
      await fs.unlink(path).catch(() => undefined);
    retainedFiles.clear();
    expect((await fs.readdir('uploads')).sort()).toEqual(originalFiles);
  });

  function upload(id = 1, title = 'Fixture party') {
    return request(app.getHttpServer())
      .post('/parties')
      .set('Authorization', `Bearer ${token(id)}`)
      .field('title', title)
      .field('meetingDate', '2027-01-01')
      .field('meetingTime', '09:00')
      .attach('thumbnail_image', png, {
        filename: 'fixture.png',
        contentType: 'image/png',
      });
  }

  it('removes the written photo when DTO validation rejects the request before the service', async () => {
    await upload(1, '').expect(400);
    expect(create).not.toHaveBeenCalled();
    expect((await fs.readdir('uploads')).sort()).toEqual(originalFiles);
  });

  it('removes the current request photo when the transaction fails', async () => {
    create.mockRejectedValueOnce(new Error('fixture write failure'));
    await upload().expect(500);
    expect(create).toHaveBeenCalledTimes(1);
    expect((await fs.readdir('uploads')).sort()).toEqual(originalFiles);
  });

  it('keeps the committed photo, and another failed request cannot delete it', async () => {
    await upload().expect(201);
    const [saved] = [...retainedFiles];
    expect((await fs.stat(saved)).size).toBeGreaterThan(0);
    await upload(1, '').expect(400);
    expect((await fs.stat(saved)).size).toBeGreaterThan(0);
  });

  it('limits an account before writing files and keeps another account independent', async () => {
    for (let index = 0; index < 10; index++) await upload().expect(201);
    const before = (await fs.readdir('uploads')).sort();
    await upload().expect(429);
    expect((await fs.readdir('uploads')).sort()).toEqual(before);
    expect(create).toHaveBeenCalledTimes(10);
    await upload(2).expect(201);
    expect(create).toHaveBeenCalledTimes(11);
  });

  it('rejects unauthenticated images before storage or service calls', async () => {
    await request(app.getHttpServer())
      .post('/parties')
      .attach('thumbnail_image', png, {
        filename: 'fixture.png',
        contentType: 'image/png',
      })
      .expect(401);
    expect(create).not.toHaveBeenCalled();
    expect((await fs.readdir('uploads')).sort()).toEqual(originalFiles);
  });
});
