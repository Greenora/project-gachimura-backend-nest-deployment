import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CreateCommunityCommentDto } from './dto/create-community-comment.dto';

interface AuthenticatedRequest {
  user: { id: number; email: string; nickname: string };
}

@ApiTags('Community')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('posts')
  @ApiOperation({ summary: '커뮤니티 피드 조회' })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
    @Query('sort') sort?: 'latest' | 'popular' | 'comments',
    @Query('locale') locale?: 'ko' | 'ja',
  ) {
    return this.communityService.findFeed(
      limit,
      cursor,
      req.user.id,
      sort,
      locale,
    );
  }

  @Get('topics/trending')
  @ApiOperation({ summary: '커뮤니티 인기 토픽 조회' })
  findTrendingTopics(
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    @Query('locale') locale?: 'ko' | 'ja',
  ) {
    return this.communityService.findTrendingTopics(limit, locale);
  }

  @Post('posts')
  @ApiOperation({ summary: '커뮤니티 글 작성' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCommunityPostDto,
  ) {
    return this.communityService.create(req.user.id, dto);
  }

  @Post('posts/:postId/likes')
  @ApiOperation({ summary: '커뮤니티 글 좋아요' })
  likePost(
    @Req() req: AuthenticatedRequest,
    @Param('postId', ParseIntPipe) postId: number,
  ) {
    return this.communityService.likePost(req.user.id, postId);
  }

  @Delete('posts/:postId/likes')
  @ApiOperation({ summary: '커뮤니티 글 좋아요 취소' })
  unlikePost(
    @Req() req: AuthenticatedRequest,
    @Param('postId', ParseIntPipe) postId: number,
  ) {
    return this.communityService.unlikePost(req.user.id, postId);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: '커뮤니티 글 댓글 조회' })
  getComments(@Param('postId', ParseIntPipe) postId: number) {
    return this.communityService.findComments(postId);
  }

  @Post('posts/:postId/comments')
  @ApiOperation({ summary: '커뮤니티 글 댓글 작성' })
  createComment(
    @Req() req: AuthenticatedRequest,
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: CreateCommunityCommentDto,
  ) {
    return this.communityService.createComment(req.user.id, postId, dto);
  }
}
