import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Review } from './entities/review.entity';
import { User } from '../users/entities/user.entity';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { toPublicUser } from '../users/user-response.mapper';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
    @InjectRepository(PartyMember)
    private memberRepository: Repository<PartyMember>,
    private dataSource: DataSource,
  ) { }

  async create(reviewerId: number, dto: CreateReviewDto) {
    const { partyId, revieweeId, score } = dto;

    // 1. 점수 범위 체크
    const validScores = [-4, -2, 0, 2, 4];
    if (!validScores.includes(score)) {
      throw new BadRequestException('유효하지 않은 점수입니다.');
    }

    // 2. 파티 존재 및 상태 확인 ( CLOSED 상태여야만 평가 가능)
    const party = await this.partyRepository.findOne({ where: { id: partyId } });
    if (!party) {
      throw new BadRequestException('존재하지 않는 모임입니다.');
    }
    if (party.status !== 'CLOSED' && party.status !== 'COMPLETED') {
      throw new BadRequestException('모임이 종료된 후에만 평가할 수 있습니다.');
    }

    // 3. 본인 평가 불가
    if (reviewerId === revieweeId) {
      throw new BadRequestException('본인에게는 점수를 메길 수 없습니다.');
    }

    // 4. 멤버십 확인 (둘 다 해당 파티의 승인된 멤버여야 함)
    const members = await this.memberRepository.find({
      where: [
        { partyId, userId: reviewerId, status: 'APPROVED' },
        { partyId, userId: revieweeId, status: 'APPROVED' }
      ]
    });

    if (members.length < 2) {
      throw new BadRequestException('해당 모임에 참여한 멤버끼리만 평가가 가능합니다.');
    }

    // 5. 중복 평가 확인
    const existing = await this.reviewRepository.findOne({
      where: { partyId, reviewerId, revieweeId }
    });
    if (existing) {
      throw new ConflictException('이미 이 멤버에 대한 평가를 완료했습니다.');
    }

    // 트랜잭션 시작
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 평가 기록 저장
      const evaluation = this.reviewRepository.create({
        partyId,
        reviewerId,
        revieweeId,
        score,
      });
      await queryRunner.manager.save(evaluation);

      // 2. 피평가자 treeScore 업데이트
      const user = await queryRunner.manager.findOne(User, { where: { id: revieweeId } });
      if (user) {
        let finalScoreChange = score;

        // 호스트 보너스 (+2점)
        if (party.hostId === revieweeId) {
          finalScoreChange += 2;
        }

        const newScore = Number(user.treeScore) + finalScoreChange;
        const newReviewsCount = Number(user.reviewsCount || 0) + 1;

        await queryRunner.manager.update(User, revieweeId, {
          treeScore: newScore,
          reviewsCount: newReviewsCount,
        });
      }

      await queryRunner.commitTransaction();
      return evaluation;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllByUser(userId: number) {
    const reviews = await this.reviewRepository.find({
      where: { revieweeId: userId },
      relations: {
        reviewer: true,
        party: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return reviews.map((review) => ({
      ...review,
      reviewer: toPublicUser(review.reviewer),
    }));
  }

  async checkReviewStatus(partyId: number, reviewerId: number) {
    // 해당 파티에 대해 이 사용자가 모든 다른 멤버에게 평가를 완료했는지 확인
    const party = await this.partyRepository.findOne({ where: { id: partyId } });
    if (!party) {
      throw new BadRequestException('존재하지 않는 모임입니다.');
    }

    // 파티가 종료되지 않았으면 평가 불가능
    if (party.status !== 'CLOSED' && party.status !== 'COMPLETED') {
      return { hasReviewed: false, reviewCount: 0, totalMembers: 0, canReview: false };
    }

    // 승인된 멤버 목록 조회
    const members = await this.memberRepository.find({
      where: { partyId, status: 'APPROVED' }
    });

    const approvedMemberCount = members.length;

    // 자신을 제외한 멤버의 수
    const otherMemberCount = approvedMemberCount - 1;

    // 평가할 대상이 없으면 평가 불가능 (자신만 남아있음)
    if (otherMemberCount <= 0) {
      return { hasReviewed: false, reviewCount: 0, totalMembers: 0, canReview: false };
    }

    // 이 사용자가 제출한 평가의 수
    const reviewCount = await this.reviewRepository.count({
      where: { partyId, reviewerId }
    });

    // 모든 다른 멤버에게 평가를 완료했으면 true
    const hasReviewed = reviewCount === otherMemberCount;
    return { hasReviewed, reviewCount, totalMembers: otherMemberCount, canReview: true };
  }
}
