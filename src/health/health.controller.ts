import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: '서버 헬스체크' })
  @ApiResponse({
    status: 200,
    description: '서버 가동 상태 정상',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-09-16T08:00:00.000Z' },
        uptime: { type: 'number', example: 123.45 },
      },
    },
  })
  @ApiResponse({ status: 503, description: '서비스 준비 상태 확인 실패' })
  async check() {
    try {
      // 로그인 조회에 필요한 테이블·컬럼만 검사하며 회원 데이터는 읽지 않습니다.
      await this.dataSource
        .getRepository(User)
        .createQueryBuilder('user')
        .where('1 = 0')
        .getMany();
    } catch {
      throw new ServiceUnavailableException(
        '서비스가 아직 준비되지 않았습니다.',
      );
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
