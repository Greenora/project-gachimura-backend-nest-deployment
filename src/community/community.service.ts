import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CommunityPost } from './entities/community-post.entity';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CommunityPostLike } from './entities/community-post-like.entity';
import { CommunityComment } from './entities/community-comment.entity';
import { CreateCommunityCommentDto } from './dto/create-community-comment.dto';

interface CursorPayload {
  createdAt: Date;
  id: number;
}

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(CommunityPost)
    private readonly communityPostRepository: Repository<CommunityPost>,
    @InjectRepository(CommunityPostLike)
    private readonly communityPostLikeRepository: Repository<CommunityPostLike>,
    @InjectRepository(CommunityComment)
    private readonly communityCommentRepository: Repository<CommunityComment>,
  ) { }

  private mapPost(
    post: CommunityPost,
    likeCount = 0,
    commentCount = 0,
    likedByMe = false,
  ) {
    return {
      id: post.id,
      content: post.content,
      createdAt: post.createdAt,
      likeCount,
      commentCount,
      likedByMe,
      author: {
        id: post.author?.id,
        nickname: post.author?.nickname,
        nickname_jp: post.author?.nickname_jp,
        profileImage: post.author?.profileImage ?? null,
      },
    };
  }

  private parseCursor(cursor?: string): CursorPayload | null {
    if (!cursor) {
      return null;
    }

    const [createdAtRaw, idRaw] = cursor.split('_');
    if (!createdAtRaw || !idRaw) {
      return null;
    }

    const createdAt = new Date(createdAtRaw);
    const id = Number(idRaw);

    if (Number.isNaN(createdAt.getTime()) || !Number.isFinite(id)) {
      return null;
    }

    return { createdAt, id };
  }

  private makeCursor(post: CommunityPost): string {
    return `${post.createdAt.toISOString()}_${post.id}`;
  }

  private async ensurePostExists(postId: number) {
    const post = await this.communityPostRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('게시글을 찾을 수 없습니다.');
    }
    return post;
  }

  async findFeed(
    limit = 30,
    cursor?: string,
    currentUserId?: number,
    sort?: 'latest' | 'popular' | 'comments',
  ) {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 100)
      : 30;

    const validSort = sort && ['latest', 'popular', 'comments'].includes(sort) ? sort : 'latest';

    const cursorPayload = this.parseCursor(cursor);

    const qb = this.communityPostRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author');

    // 정렬 방식에 따라 서브쿼리 추가
    if (validSort === 'popular') {
      qb.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(pl.id)', 'likeCount')
          .from(CommunityPostLike, 'pl')
          .where('pl.postId = post.id');
      }, 'sortLikeCount')
        .orderBy('sortLikeCount', 'DESC')
        .addOrderBy('post.createdAt', 'DESC')
        .addOrderBy('post.id', 'DESC');
    } else if (validSort === 'comments') {
      qb.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(cc.id)', 'commentCount')
          .from(CommunityComment, 'cc')
          .where('cc.postId = post.id');
      }, 'sortCommentCount')
        .orderBy('sortCommentCount', 'DESC')
        .addOrderBy('post.createdAt', 'DESC')
        .addOrderBy('post.id', 'DESC');
    } else {
      qb.orderBy('post.createdAt', 'DESC')
        .addOrderBy('post.id', 'DESC');
    }

    qb.take(safeLimit + 1);

    // 정렬 기준이 변경되면 기존에 발급된 cursor가 더 이상 유효하지 않으므로 클라이언트에서 새롭게 조회해야 함.
    // 커서 기반 페이지네이션은 오직 최신순(latest) 정렬에서만 적용
    if (cursorPayload && validSort === 'latest') {
      qb.andWhere(
        '(post.createdAt < :cursorCreatedAt OR (post.createdAt = :cursorCreatedAt AND post.id < :cursorId))',
        {
          cursorCreatedAt: cursorPayload.createdAt,
          cursorId: cursorPayload.id,
        },
      );
    } else if (cursor) {
      // TODO: 인기순/댓글순의 경우 offset 기반 페이징을 임시로 사용,
      // 데이터가 새로 생성되거나 변경될 때 중복 노출 혹은 누락이 발생할 수 있고 데이터가 많아질수록 조회 성능이 떨어질 수 있음
      // 차후 '좋아요수_게시글ID' 조합 등의 복합 커서 기반 페이지네이션으로 전환하는 것을 권장
      const offset = parseInt(cursor, 10);
      if (Number.isFinite(offset) && offset > 0) {
        qb.skip(offset);
      }
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > safeLimit;
    const items = hasMore ? rows.slice(0, safeLimit) : rows;
    const postIds = items.map((post) => post.id);

    const likeRows = postIds.length
      ? await this.communityPostLikeRepository
        .createQueryBuilder('like')
        .select('like.postId', 'postId')
        .addSelect('COUNT(1)', 'count')
        .where('like.postId IN (:...postIds)', { postIds })
        .groupBy('like.postId')
        .getRawMany<{ postId: string; count: string }>()
      : [];

    const commentRows = postIds.length
      ? await this.communityCommentRepository
        .createQueryBuilder('comment')
        .select('comment.postId', 'postId')
        .addSelect('COUNT(1)', 'count')
        .where('comment.postId IN (:...postIds)', { postIds })
        .groupBy('comment.postId')
        .getRawMany<{ postId: string; count: string }>()
      : [];

    const likedRows = currentUserId && postIds.length
      ? await this.communityPostLikeRepository.find({
        select: { postId: true },
        where: { userId: currentUserId, postId: In(postIds) },
      })
      : [];

    const likeCountMap = new Map<number, number>(
      likeRows.map((row) => [Number(row.postId), Number(row.count)]),
    );
    const commentCountMap = new Map<number, number>(
      commentRows.map((row) => [Number(row.postId), Number(row.count)]),
    );
    const likedByMeSet = new Set<number>(likedRows.map((row) => row.postId));

    let nextCursor: string | null = null;
    if (hasMore) {
      if (validSort === 'latest') {
        nextCursor = this.makeCursor(items[items.length - 1]);
      } else {
        // popular/comments 정렬: offset 기반 커서
        const currentOffset = cursor ? parseInt(cursor, 10) : 0;
        nextCursor = String((Number.isFinite(currentOffset) ? currentOffset : 0) + safeLimit);
      }
    }

    return {
      items: items.map((post) =>
        this.mapPost(
          post,
          likeCountMap.get(post.id) || 0,
          commentCountMap.get(post.id) || 0,
          likedByMeSet.has(post.id),
        ),
      ),
      nextCursor,
      hasMore,
    };
  }

  async findTrendingTopics(limit = 5) {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 20)
      : 5;

    const recentPosts = await this.communityPostRepository.find({
      select: { content: true },
      order: { createdAt: 'DESC' },
      take: 300,
    });

    const hashtagRegex = /#([\p{L}\p{N}_]+)/gu;
    const counts = new Map<string, number>();

    for (const post of recentPosts) {
      const matches = post.content?.matchAll(hashtagRegex) || [];
      for (const match of matches) {
        const rawTag = match[1]?.trim();
        if (!rawTag) {
          continue;
        }
        const normalized = rawTag.toLowerCase();
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    const topics = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, safeLimit)
      .map(([tag, count]) => ({ tag: `#${tag}`, count }));

    return {
      topics,
      updatedAt: new Date().toISOString(),
    };
  }

  async create(authorId: number, dto: CreateCommunityPostDto) {
    const post = this.communityPostRepository.create({
      authorId,
      content: dto.content,
    });

    const saved = await this.communityPostRepository.save(post);

    const created = await this.communityPostRepository.findOne({
      where: { id: saved.id },
      relations: { author: true },
    });

    if (!created) {
      throw new NotFoundException('생성된 게시글을 찾을 수 없습니다.');
    }

    return this.mapPost(created, 0, 0, false);
  }

  async likePost(userId: number, postId: number) {
    await this.ensurePostExists(postId);

    const exists = await this.communityPostLikeRepository.findOne({
      where: { userId, postId },
    });

    if (!exists) {
      const like = this.communityPostLikeRepository.create({ userId, postId });
      await this.communityPostLikeRepository.save(like);
    }

    return { likedByMe: true };
  }

  async unlikePost(userId: number, postId: number) {
    await this.ensurePostExists(postId);

    await this.communityPostLikeRepository.delete({ userId, postId });
    return { likedByMe: false };
  }

  async findComments(postId: number) {
    await this.ensurePostExists(postId);

    const comments = await this.communityCommentRepository.find({
      where: { postId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });

    return comments.map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      content: comment.content,
      createdAt: comment.createdAt,
      author: {
        id: comment.author?.id,
        nickname: comment.author?.nickname,
        nickname_jp: comment.author?.nickname_jp,
        profileImage: comment.author?.profileImage ?? null,
      },
    }));
  }

  async createComment(
    authorId: number,
    postId: number,
    dto: CreateCommunityCommentDto,
  ) {
    await this.ensurePostExists(postId);

    const comment = this.communityCommentRepository.create({
      authorId,
      postId,
      content: dto.content,
    });
    const saved = await this.communityCommentRepository.save(comment);
    const created = await this.communityCommentRepository.findOne({
      where: { id: saved.id },
      relations: { author: true },
    });

    if (!created) {
      throw new NotFoundException('생성된 댓글을 찾을 수 없습니다.');
    }

    return {
      id: created.id,
      postId: created.postId,
      content: created.content,
      createdAt: created.createdAt,
      author: {
        id: created.author?.id,
        nickname: created.author?.nickname,
        nickname_jp: created.author?.nickname_jp,
        profileImage: created.author?.profileImage ?? null,
      },
    };
  }
}
