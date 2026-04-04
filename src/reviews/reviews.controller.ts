import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '후기 작성', description: '모임 종료 후 유저에게 후기를 남깁니다.' })
  create(@Req() req, @Body() dto: CreateReviewDto) {
    const reviewerId = req.user.id;
    return this.reviewsService.create(reviewerId, dto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: '특정 유저의 후기 목록 조회' })
  findAllByUser(@Param('userId') userId: string) {
    return this.reviewsService.findAllByUser(+userId);
  }

  @Get('check/:partyId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '특정 모임에 대한 평가 완료 여부 확인' })
  checkReviewStatus(@Req() req, @Param('partyId') partyId: string) {
    const reviewerId = req.user.id;
    return this.reviewsService.checkReviewStatus(+partyId, reviewerId);
  }
}
