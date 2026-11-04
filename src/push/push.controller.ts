import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isAllowedOrigin } from '../config/cors';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushService } from './push.service';

interface AuthenticatedRequest {
  user: { id: number };
  headers: { origin?: string };
}

@Controller('push')
@ApiTags('Push')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
export class PushController {
  constructor(private readonly pushService: PushService) {}

  private checkOrigin(request: AuthenticatedRequest) {
    if (!isAllowedOrigin(request.headers.origin)) {
      throw new ForbiddenException('허용되지 않은 알림 설정 요청입니다.');
    }
  }

  @Get('config')
  @Header('Cache-Control', 'no-store')
  getConfig() {
    return this.pushService.getConfig();
  }

  @Post('subscriptions')
  subscribe(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreatePushSubscriptionDto,
  ) {
    this.checkOrigin(request);
    return this.pushService.subscribe(request.user.id, input);
  }

  @Delete('subscriptions')
  unsubscribe(
    @Req() request: AuthenticatedRequest,
    @Body() input: DeletePushSubscriptionDto,
  ) {
    this.checkOrigin(request);
    return this.pushService.unsubscribe(request.user.id, input.endpoint);
  }
}
