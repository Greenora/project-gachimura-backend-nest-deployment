import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import fs from 'node:fs';
import { Server } from 'node:http';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { OcrService } from './ocr.service';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

describe('authenticated receipt OCR request limit', () => {
  const secret = 'ocr-rate-limit-fixture-only-'.repeat(3);
  const jwt = new JwtService({ secret });
  const token = (id: number) =>
    jwt.sign(
      { sub: id, email: `fixture-${id}@example.test`, nickname: 'OCR fixture' },
      { expiresIn: '1h' },
    );
  const png = Buffer.from('89504e470d0a1a0a0000000000000000', 'hex');
  const parseReceipt = jest.fn().mockResolvedValue({
    storeName: null,
    items: [{ name: 'Fixture item', price: 1000, quantity: 1 }],
    totalPrice: 1000,
    currency: 'KRW',
  });
  let app: INestApplication<Server>;
  let writes: jest.SpyInstance;
  let beforeFiles: string[];

  beforeAll(async () => {
    beforeFiles = await fs.promises.readdir('uploads');
    writes = jest.spyOn(fs, 'createWriteStream');
    const fixture = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: minutes(1), limit: 20 }])],
      controllers: [SettlementsController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        { provide: OcrService, useValue: { parseReceipt } },
        {
          provide: SettlementsService,
          useValue: { findOne: () => ({ id: 1, status: 'DRAFT' }) },
        },
      ],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    try {
      await app?.close();
      expect(await fs.promises.readdir('uploads')).toEqual(beforeFiles);
    } finally {
      jest.restoreAllMocks();
    }
  });

  const upload = (accessToken?: string) => {
    const req = request(app.getHttpServer()).post(
      '/api/settlements/upload-receipt',
    );
    if (accessToken) req.set('Authorization', `Bearer ${accessToken}`);
    return req.attach('receipt', png, {
      filename: 'fixture.png',
      contentType: 'image/png',
    });
  };

  it('rejects unauthenticated requests before file writes or Vision calls', async () => {
    await upload().expect(401);
    expect(writes).not.toHaveBeenCalled();
    expect(parseReceipt).not.toHaveBeenCalled();
  });

  it('limits each authenticated account before upload writes and recovers after one minute', async () => {
    const first = token(1);
    const second = token(2);
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      for (let index = 0; index < 10; index++) await upload(first).expect(201);
      expect(parseReceipt).toHaveBeenCalledTimes(10);
      expect(writes).toHaveBeenCalledTimes(10);
      const blocked = await upload(first).expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(parseReceipt).toHaveBeenCalledTimes(10);
      expect(writes).toHaveBeenCalledTimes(10);

      await upload(second).expect(201);
      expect(parseReceipt).toHaveBeenCalledTimes(11);
      expect(writes).toHaveBeenCalledTimes(11);

      await upload(first).set('X-Forwarded-For', '203.0.113.7').expect(429);
      expect(parseReceipt).toHaveBeenCalledTimes(11);
      expect(writes).toHaveBeenCalledTimes(11);

      clock.mockReturnValue(now + minutes(1) + 1);
      await upload(first).expect(201);
      expect(parseReceipt).toHaveBeenCalledTimes(12);
      expect(writes).toHaveBeenCalledTimes(12);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not apply the OCR budget to other settlement routes', async () => {
    for (let index = 0; index < 12; index++) {
      await request(app.getHttpServer())
        .get('/api/settlements/1')
        .set('Authorization', `Bearer ${token(3)}`)
        .expect(200);
    }
    await upload(token(3)).expect(201);
    expect(parseReceipt).toHaveBeenCalledTimes(13);
  });
});
