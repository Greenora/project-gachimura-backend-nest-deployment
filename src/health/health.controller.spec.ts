import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { HealthController } from './health.controller';
import { HealthModule } from './health.module';

const getMany = jest.fn<Promise<User[]>, []>();
const where = jest.fn().mockReturnThis();
const createQueryBuilder = jest.fn().mockReturnValue({ where, getMany });
const getRepository = jest.fn().mockReturnValue({ createQueryBuilder });
const dataSource = { getRepository };

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: dataSource }],
  exports: [DataSource],
})
class FixtureDatabaseModule {}

describe('health readiness HTTP contract', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [FixtureDatabaseModule, HealthModule],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('resolves the existing global DataSource through HealthModule', () => {
    expect(app.get(DataSource)).toBe(dataSource);
    expect(app.get(HealthController)).toBeInstanceOf(HealthController);
  });

  it('checks login columns without returning member rows and preserves the success response', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
    });
    expect(getRepository).toHaveBeenCalledWith(User);
    expect(createQueryBuilder).toHaveBeenCalledWith('user');
    expect(where).toHaveBeenCalledWith('1 = 0');
    expect(getMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    'ER_NO_SUCH_TABLE: fixture_database.users does not exist',
    'ER_BAD_FIELD_ERROR: fixture_private_column is unknown',
    'ECONNREFUSED: fixture_internal_database_host',
  ])(
    'returns a generic 503 when the database check fails (%s)',
    async (detail) => {
      getMany.mockRejectedValueOnce(new Error(detail));

      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(503);

      expect(response.body).toEqual({
        statusCode: 503,
        message: '서비스가 아직 준비되지 않았습니다.',
        error: 'Service Unavailable',
      });
      expect(response.text).not.toContain(detail);
      expect(response.text).not.toContain('fixture_');
    },
  );

  it('checks again and becomes ready after a transient database failure', async () => {
    getMany.mockRejectedValueOnce(new Error('fixture temporary failure'));
    await request(app.getHttpServer()).get('/api/health').expect(503);
    await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(getMany).toHaveBeenCalledTimes(2);
  });
});
