import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Settlement } from './entities/settlement.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { ChatGateway } from '../chat/chat.gateway';
import { UpdateSettlementItemsDto } from './dto/update-settlement-items.dto';
import { SelectItemsDto } from './dto/select-items.dto';
import { toPublicUser } from '../users/user-response.mapper';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private settlementRepository: Repository<Settlement>,
    @InjectRepository(SettlementItem)
    private itemRepository: Repository<SettlementItem>,
    @InjectRepository(SettlementItemMember)
    private itemMemberRepository: Repository<SettlementItemMember>,
    @InjectRepository(SettlementPayment)
    private paymentRepository: Repository<SettlementPayment>,
    @InjectRepository(Party)
    private partyRepository: Repository<Party>,
    @InjectRepository(PartyMember)
    private memberRepository: Repository<PartyMember>,
    private dataSource: DataSource,
    private chatGateway: ChatGateway,
  ) {}

  private toPublicSettlement(settlement: Settlement) {
    return {
      ...settlement,
      host: toPublicUser(settlement.host),
      items: settlement.items?.map((item) => ({
        ...item,
        members: item.members?.map((member) => ({
          ...member,
          user: toPublicUser(member.user),
        })),
      })),
    };
  }

  private async ensurePartyAccess(partyId: number, userId: number) {
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });
    if (!party) {
      throw new NotFoundException('모임을 찾을 수 없습니다.');
    }
    if (party.hostId === userId) {
      return;
    }

    const member = await this.memberRepository.findOne({
      where: { partyId, userId, status: 'APPROVED' },
    });
    if (!member) {
      throw new ForbiddenException('이 모임의 정산을 조회할 권한이 없습니다.');
    }
  }

  private async ensureSettlementAccess(settlementId: number, userId: number) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensurePartyAccess(settlement.partyId, userId);
  }

  private async ensureSettlementHost(
    settlement: Settlement,
    userId: number,
    message: string,
  ) {
    const party = await this.partyRepository.findOne({
      where: { id: settlement.partyId },
    });
    if (!party) {
      throw new NotFoundException('모임을 찾을 수 없습니다.');
    }
    if (party.hostId !== userId) {
      throw new ForbiddenException(message);
    }

    if (settlement.hostId !== party.hostId) {
      await this.settlementRepository.update(settlement.id, {
        hostId: party.hostId,
      });
      settlement.hostId = party.hostId;
    }
  }

  // 정산 생성 (호스트 전용)
  async create(hostId: number, partyId: number) {
    const party = await this.partyRepository.findOne({
      where: { id: partyId },
    });
    if (!party) {
      throw new NotFoundException('모임을 찾을 수 없습니다.');
    }
    if (party.hostId !== hostId) {
      throw new ForbiddenException('호스트만 정산을 생성할 수 있습니다.');
    }

    // 이미 진행중인 정산이 있는지 확인
    const existing = await this.settlementRepository.findOne({
      where: { partyId, status: In(['DRAFT', 'SELECTING', 'CONFIRMED']) },
    });
    if (existing) {
      return existing;
    }

    const settlement = this.settlementRepository.create({
      partyId,
      hostId,
      status: 'DRAFT',
    });
    return this.settlementRepository.save(settlement);
  }

  // 정산 상세 조회
  async findOne(settlementId: number, userId: number) {
    await this.ensureSettlementAccess(settlementId, userId);

    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
      relations: [
        'items',
        'items.members',
        'items.members.user',
        'host',
        'party',
      ],
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    return this.toPublicSettlement(settlement);
  }

  // 파티 ID로 정산 조회
  async findByPartyId(partyId: number, userId: number) {
    await this.ensurePartyAccess(partyId, userId);

    const settlement = await this.settlementRepository.findOne({
      where: { partyId },
      relations: [
        'items',
        'items.members',
        'items.members.user',
        'host',
        'party',
      ],
      order: { createdAt: 'DESC' },
    });
    return settlement ? this.toPublicSettlement(settlement) : null;
  }

  // 품목 업데이트 (호스트가 OCR 결과 수정 후 저장)
  async updateItems(
    settlementId: number,
    hostId: number,
    dto: UpdateSettlementItemsDto,
  ) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensureSettlementHost(
      settlement,
      hostId,
      '호스트만 품목을 수정할 수 있습니다.',
    );
    if (settlement.status !== 'DRAFT') {
      throw new BadRequestException('수정 가능한 상태가 아닙니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 기존 품목 삭제
      await queryRunner.manager.delete(SettlementItem, {
        settlementId,
      });

      // 새 품목 저장
      let totalAmount = 0;
      for (const item of dto.items) {
        const newItem = this.itemRepository.create({
          settlementId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        });
        await queryRunner.manager.save(newItem);
        totalAmount += item.price * item.quantity;
      }

      // 총액 업데이트
      await queryRunner.manager.update(Settlement, settlementId, {
        totalAmount,
      });

      await queryRunner.commitTransaction();

      return this.findOne(settlementId, hostId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 정산 시작하기 (DRAFT → SELECTING, 멤버들에게 알림)
  async startSelecting(
    settlementId: number,
    hostId: number,
    resumedFromEdit = false,
  ) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
      relations: ['items'],
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensureSettlementHost(
      settlement,
      hostId,
      '호스트만 정산을 시작할 수 있습니다.',
    );
    if (settlement.status !== 'DRAFT' && settlement.status !== 'SELECTING') {
      throw new BadRequestException('이미 시작된 정산입니다.');
    }
    if (!settlement.items || settlement.items.length === 0) {
      throw new BadRequestException('품목을 먼저 등록해주세요.');
    }

    const updateResult = await this.settlementRepository.update(
      { id: settlementId, status: 'DRAFT' },
      { status: 'SELECTING' },
    );

    // 상태가 실제로 전환된 경우에만 시스템 메시지 1회 전송
    if (updateResult.affected && updateResult.affected > 0) {
      await this.chatGateway.sendSystemMessage(
        settlement.partyId,
        resumedFromEdit
          ? '__SYS__|SETTLEMENT_RESUMED'
          : '__SYS__|SETTLEMENT_START',
      );
    }

    return this.findOne(settlementId, hostId);
  }

  // 호스트: SELECTING → DRAFT 되돌리기 (품목 수정 가능)
  async revertToDraft(settlementId: number, hostId: number) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
      relations: ['items'],
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensureSettlementHost(
      settlement,
      hostId,
      '호스트만 수정할 수 있습니다.',
    );
    if (settlement.status !== 'SELECTING' && settlement.status !== 'DRAFT') {
      throw new BadRequestException('수정 가능한 상태가 아닙니다.');
    }

    const updateResult = await this.settlementRepository.update(
      { id: settlementId, status: 'SELECTING' },
      { status: 'DRAFT' },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      // 상태가 실제로 바뀐 경우에만 선택 내역 삭제 및 메시지 전송
      for (const item of settlement.items) {
        await this.itemMemberRepository.delete({ itemId: item.id });
      }

      await this.chatGateway.sendSystemMessage(
        settlement.partyId,
        '__SYS__|SETTLEMENT_EDITING',
      );
    }

    return this.findOne(settlementId, hostId);
  }

  // 게스트: 본인 참여 항목 선택
  async selectItems(settlementId: number, userId: number, dto: SelectItemsDto) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    if (settlement.status !== 'SELECTING') {
      throw new BadRequestException('항목 선택 기간이 아닙니다.');
    }

    // 멤버 자격 확인
    const member = await this.memberRepository.findOne({
      where: {
        partyId: settlement.partyId,
        userId,
        status: 'APPROVED',
      },
    });
    if (!member) {
      throw new ForbiddenException('이 모임의 멤버가 아닙니다.');
    }

    // 품목 존재 확인
    const items = await this.itemRepository.find({
      where: { settlementId, id: In(dto.itemIds) },
    });
    if (items.length !== dto.itemIds.length) {
      throw new BadRequestException('유효하지 않은 품목이 포함되어 있습니다.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 기존 선택 삭제
      const existingSelections = await this.itemMemberRepository.find({
        where: { userId },
        relations: ['item'],
      });
      const mySelections = existingSelections.filter(
        (s) => s.item.settlementId === settlementId,
      );
      if (mySelections.length > 0) {
        await queryRunner.manager.remove(mySelections);
      }

      // 새로운 선택 저장
      for (const itemId of dto.itemIds) {
        const selection = this.itemMemberRepository.create({
          itemId,
          userId,
        });
        await queryRunner.manager.save(selection);
      }

      await queryRunner.commitTransaction();
      return this.findOne(settlementId, userId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 호스트: 최종 확정 → 1/N 계산 → 채팅방에 메시지 전송
  async confirm(settlementId: number, hostId: number) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
      relations: ['items', 'items.members', 'items.members.user', 'party'],
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensureSettlementHost(
      settlement,
      hostId,
      '호스트만 정산을 확정할 수 있습니다.',
    );
    if (settlement.status !== 'SELECTING') {
      throw new BadRequestException('확정 가능한 상태가 아닙니다.');
    }

    // 멤버별 금액 계산
    const memberAmounts: Record<number, number> = {};

    for (const item of settlement.items) {
      if (!item.members || item.members.length === 0) continue;
      const perPerson = Math.ceil(
        (item.price * item.quantity) / item.members.length,
      );
      for (const member of item.members) {
        memberAmounts[member.userId] =
          (memberAmounts[member.userId] || 0) + perPerson;
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 결제 정보 저장
      for (const [userIdStr, info] of Object.entries(memberAmounts)) {
        const uid = Number(userIdStr);
        // 호스트 본인은 건너뛰기
        if (uid === hostId) continue;

        const payment = this.paymentRepository.create({
          settlementId,
          userId: uid,
          amount: info,
          status: 'PENDING',
        });
        await queryRunner.manager.save(payment);
      }

      // 상태 업데이트
      await queryRunner.manager.update(Settlement, settlementId, {
        status: 'CONFIRMED',
      });

      await queryRunner.commitTransaction();

      // 채팅방에 언어 중립 토큰 메시지 전송
      const detailParts = Object.entries(memberAmounts)
        .filter(([userIdStr]) => Number(userIdStr) !== hostId)
        .map(([userIdStr, amount]) => `${userIdStr}:${amount}`)
        .join(',');

      await this.chatGateway.sendSystemMessage(
        settlement.partyId,
        `__SYS__|SETTLEMENT_CONFIRMED|${settlement.totalAmount}|${detailParts}`,
      );

      return this.findOne(settlementId, hostId);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // 입금 확인 처리 (호스트)
  async updatePayment(
    settlementId: number,
    hostId: number,
    userId: number,
    status: string,
  ) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    await this.ensureSettlementHost(
      settlement,
      hostId,
      '호스트만 입금 확인을 할 수 있습니다.',
    );

    const payment = await this.paymentRepository.findOne({
      where: { settlementId, userId },
      relations: ['user'],
    });
    if (!payment) {
      throw new NotFoundException('결제 정보를 찾을 수 없습니다.');
    }

    payment.status = status;
    await this.paymentRepository.save(payment);

    if (status === 'PAID') {
      const nickname = payment.user?.nickname || '알 수 없음';
      await this.chatGateway.sendSystemMessage(
        settlement.partyId,
        `✅ ${nickname}님의 입금이 확인되었습니다.`,
      );

      // 모든 입금이 완료되었는지 확인
      const allPayments = await this.paymentRepository.find({
        where: { settlementId },
      });
      const allPaid = allPayments.every((p) => p.status === 'PAID');
      if (allPaid) {
        await this.settlementRepository.update(settlementId, {
          status: 'COMPLETED',
        });
        await this.chatGateway.sendSystemMessage(
          settlement.partyId,
          '🎉 모든 정산이 완료되었습니다!',
        );
      }
    }

    return {
      ...payment,
      user: toPublicUser(payment.user),
    };
  }

  // 정산 결제 현황 조회
  async getPayments(settlementId: number, userId: number) {
    await this.ensureSettlementAccess(settlementId, userId);

    const payments = await this.paymentRepository.find({
      where: { settlementId },
      relations: ['user'],
    });

    return payments.map((payment) => ({
      ...payment,
      user: toPublicUser(payment.user),
    }));
  }
}
