import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
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
  private readonly logger = new Logger(SettlementsService.name);

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

  private async ensurePartyAccess(
    partyId: number,
    userId: number,
    manager?: EntityManager,
  ) {
    const party = manager
      ? await manager.findOne(Party, { where: { id: partyId } })
      : await this.partyRepository.findOne({ where: { id: partyId } });
    if (!party) {
      throw new NotFoundException('모임을 찾을 수 없습니다.');
    }
    if (party.hostId === userId) {
      return;
    }

    const where = { partyId, userId, status: 'APPROVED' };
    const member = manager
      ? await manager.findOne(PartyMember, { where })
      : await this.memberRepository.findOne({ where });
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
    manager: EntityManager,
  ) {
    const party = await manager.findOne(Party, {
      where: { id: settlement.partyId },
    });
    if (!party) {
      throw new NotFoundException('모임을 찾을 수 없습니다.');
    }
    if (party.hostId !== userId) {
      throw new ForbiddenException(message);
    }

    if (settlement.hostId !== party.hostId) {
      await manager.update(Settlement, settlement.id, {
        hostId: party.hostId,
      });
      settlement.hostId = party.hostId;
    }
  }

  private async lockedSettlement(manager: EntityManager, settlementId: number) {
    const settlement = await manager.findOne(Settlement, {
      where: { id: settlementId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!settlement) {
      throw new NotFoundException('정산을 찾을 수 없습니다.');
    }
    return settlement;
  }

  private async sendSystemMessage(partyId: number, message: string) {
    try {
      await this.chatGateway.sendSystemMessage(partyId, message);
    } catch {
      this.logger.warn('정산 시스템 메시지를 전송하지 못했습니다.');
    }
  }

  private notifyUpdated(partyId: number, settlementId: number) {
    try {
      this.chatGateway.notifySettlementUpdated(partyId, settlementId);
    } catch {
      this.logger.warn('정산 상태 갱신을 알리지 못했습니다.');
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
    const saved = await this.settlementRepository.save(settlement);
    this.notifyUpdated(partyId, saved.id);
    return saved;
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let partyId = 0;

    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensureSettlementHost(
        settlement,
        hostId,
        '호스트만 품목을 수정할 수 있습니다.',
        queryRunner.manager,
      );
      if (settlement.status !== 'DRAFT') {
        throw new BadRequestException('수정 가능한 상태가 아닙니다.');
      }

      const existingItems = await queryRunner.manager.find(SettlementItem, {
        where: { settlementId },
      });
      const existingIds = new Set(existingItems.map((item) => item.id));
      const retainedIds = dto.items
        .filter((item) => item.id !== undefined)
        .map((item) => item.id as number);
      if (
        new Set(retainedIds).size !== retainedIds.length ||
        retainedIds.some((id) => !Number.isInteger(id) || !existingIds.has(id))
      ) {
        throw new BadRequestException(
          '변경되었거나 유효하지 않은 품목입니다. 새로 확인해주세요.',
        );
      }
      const removedIds = existingItems
        .filter((item) => !retainedIds.includes(item.id))
        .map((item) => item.id);
      if (removedIds.length) {
        await queryRunner.manager.delete(SettlementItem, {
          settlementId,
          id: In(removedIds),
        });
      }

      let totalAmount = 0;
      for (const item of dto.items) {
        const values = {
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        };
        // 기존 품목의 선택자는 유지하고, 삭제한 품목만 함께 지운다.
        if (item.id !== undefined) {
          await queryRunner.manager.update(
            SettlementItem,
            { id: item.id, settlementId },
            values,
          );
        } else {
          await queryRunner.manager.save(
            this.itemRepository.create({ settlementId, ...values }),
          );
        }
        totalAmount += item.price * item.quantity;
      }

      // 총액 업데이트
      await queryRunner.manager.update(Settlement, settlementId, {
        totalAmount,
      });
      partyId = settlement.partyId;
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    this.notifyUpdated(partyId, settlementId);
    return this.findOne(settlementId, hostId);
  }

  // 정산 시작하기 (DRAFT → SELECTING, 멤버들에게 알림)
  async startSelecting(
    settlementId: number,
    hostId: number,
    resumedFromEdit = false,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let partyId = 0;
    let changed = false;
    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensureSettlementHost(
        settlement,
        hostId,
        '호스트만 정산을 시작할 수 있습니다.',
        queryRunner.manager,
      );
      if (settlement.status !== 'DRAFT' && settlement.status !== 'SELECTING') {
        throw new BadRequestException('이미 시작된 정산입니다.');
      }
      const items = await queryRunner.manager.find(SettlementItem, {
        where: { settlementId },
      });
      if (!items.length) {
        throw new BadRequestException('품목을 먼저 등록해주세요.');
      }
      partyId = settlement.partyId;
      if (settlement.status === 'DRAFT') {
        await queryRunner.manager.update(Settlement, settlementId, {
          status: 'SELECTING',
        });
        changed = true;
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    if (changed) {
      this.notifyUpdated(partyId, settlementId);
      await this.sendSystemMessage(
        partyId,
        resumedFromEdit
          ? '__SYS__|SETTLEMENT_RESUMED'
          : '__SYS__|SETTLEMENT_START',
      );
    }
    return this.findOne(settlementId, hostId);
  }

  // 호스트: SELECTING → DRAFT 되돌리기 (품목 수정 가능)
  async revertToDraft(settlementId: number, hostId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let partyId = 0;
    let changed = false;
    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensureSettlementHost(
        settlement,
        hostId,
        '호스트만 수정할 수 있습니다.',
        queryRunner.manager,
      );
      if (settlement.status !== 'SELECTING' && settlement.status !== 'DRAFT') {
        throw new BadRequestException('수정 가능한 상태가 아닙니다.');
      }
      partyId = settlement.partyId;
      if (settlement.status === 'SELECTING') {
        await queryRunner.manager.update(Settlement, settlementId, {
          status: 'DRAFT',
        });
        changed = true;
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    if (changed) {
      this.notifyUpdated(partyId, settlementId);
      await this.sendSystemMessage(partyId, '__SYS__|SETTLEMENT_EDITING');
    }
    return this.findOne(settlementId, hostId);
  }

  // 멤버: 본인 참여 항목 선택
  async selectItems(settlementId: number, userId: number, dto: SelectItemsDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let partyId = 0;

    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensurePartyAccess(
        settlement.partyId,
        userId,
        queryRunner.manager,
      );
      if (settlement.status !== 'SELECTING') {
        throw new BadRequestException('항목 선택 기간이 아닙니다.');
      }
      partyId = settlement.partyId;
      const items = await queryRunner.manager.find(SettlementItem, {
        where: { settlementId, id: In(dto.itemIds) },
      });
      if (items.length !== dto.itemIds.length) {
        throw new BadRequestException(
          '유효하지 않은 품목이 포함되어 있습니다.',
        );
      }
      // 기존 선택 삭제
      const existingSelections = await queryRunner.manager.find(
        SettlementItemMember,
        {
          where: { userId, item: { settlementId } },
          relations: ['item'],
        },
      );
      if (existingSelections.length > 0) {
        await queryRunner.manager.remove(existingSelections);
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    this.notifyUpdated(partyId, settlementId);
    return this.findOne(settlementId, userId);
  }

  // 호스트: 최종 확정 → 1/N 계산 → 채팅방에 메시지 전송
  async confirm(settlementId: number, hostId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let guestAmounts: [string, number][] = [];
    let completed = false;
    let partyId = 0;
    let totalAmount = 0;

    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensureSettlementHost(
        settlement,
        hostId,
        '호스트만 정산을 확정할 수 있습니다.',
        queryRunner.manager,
      );
      if (settlement.status !== 'SELECTING') {
        throw new BadRequestException('확정 가능한 상태가 아닙니다.');
      }
      const items = await queryRunner.manager.find(SettlementItem, {
        where: { settlementId },
        relations: ['members'],
      });
      if (!items.length) {
        throw new BadRequestException('정산할 품목이 없습니다.');
      }
      const memberAmounts: Record<number, number> = {};
      for (const item of items) {
        if (!item.members || item.members.length === 0) {
          throw new BadRequestException(
            '선택한 사람이 없는 품목이 있습니다. 모든 품목의 참여자를 선택해주세요.',
          );
        }
        const members = [...item.members].sort((a, b) => a.userId - b.userId);
        const total = item.price * item.quantity;
        const perPerson = Math.floor(total / members.length);
        const remainder = total % members.length;
        for (const [index, member] of members.entries()) {
          memberAmounts[member.userId] =
            (memberAmounts[member.userId] || 0) +
            perPerson +
            (index < remainder ? 1 : 0);
        }
      }
      guestAmounts = Object.entries(memberAmounts).filter(
        ([userId]) => Number(userId) !== hostId,
      );
      completed = guestAmounts.every(([, amount]) => amount === 0);
      partyId = settlement.partyId;
      totalAmount = settlement.totalAmount;

      const updateResult = await queryRunner.manager.update(
        Settlement,
        { id: settlementId, status: 'SELECTING' },
        { status: completed ? 'COMPLETED' : 'CONFIRMED' },
      );
      if (!updateResult.affected) {
        throw new BadRequestException('이미 확정된 정산입니다.');
      }

      // 결제 정보 저장
      for (const [userId, amount] of guestAmounts) {
        const payment = this.paymentRepository.create({
          settlementId,
          userId: Number(userId),
          amount,
          status: amount === 0 ? 'PAID' : 'PENDING',
        });
        await queryRunner.manager.save(payment);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    this.notifyUpdated(partyId, settlementId);
    // 채팅 전송 실패가 이미 커밋한 정산을 롤백하지 않도록 분리한다.
    const detailParts = guestAmounts
      .map(([userId, amount]) => `${userId}:${amount}`)
      .join(',');
    await this.sendSystemMessage(
      partyId,
      `__SYS__|SETTLEMENT_CONFIRMED|${totalAmount}|${detailParts}`,
    );
    if (completed) {
      await this.sendSystemMessage(partyId, '🎉 모든 정산이 완료되었습니다!');
    }

    return this.findOne(settlementId, hostId);
  }

  // 입금 확인 처리 (호스트)
  async updatePayment(
    settlementId: number,
    hostId: number,
    userId: number,
    status: string,
  ) {
    if (status !== 'PAID') {
      throw new BadRequestException('입금 완료 확인만 요청할 수 있습니다.');
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let payment!: SettlementPayment;
    let partyId = 0;
    let changed = false;
    let completed = false;
    try {
      const settlement = await this.lockedSettlement(
        queryRunner.manager,
        settlementId,
      );
      await this.ensureSettlementHost(
        settlement,
        hostId,
        '호스트만 입금 확인을 할 수 있습니다.',
        queryRunner.manager,
      );
      if (
        settlement.status !== 'CONFIRMED' &&
        settlement.status !== 'COMPLETED'
      ) {
        throw new BadRequestException('입금을 확인할 수 있는 정산이 아닙니다.');
      }
      const existing = await queryRunner.manager.findOne(SettlementPayment, {
        where: { settlementId, userId },
        relations: ['user'],
      });
      if (!existing) {
        throw new NotFoundException('결제 정보를 찾을 수 없습니다.');
      }
      payment = existing;
      partyId = settlement.partyId;
      if (payment.status !== 'PAID') {
        if (settlement.status !== 'CONFIRMED' || payment.status !== 'PENDING') {
          throw new BadRequestException(
            '입금을 확인할 수 있는 상태가 아닙니다.',
          );
        }
        payment.status = 'PAID';
        await queryRunner.manager.save(payment);
        const allPayments = await queryRunner.manager.find(SettlementPayment, {
          where: { settlementId },
        });
        if (allPayments.every((value) => value.status === 'PAID')) {
          await queryRunner.manager.update(Settlement, settlementId, {
            status: 'COMPLETED',
          });
          completed = true;
        }
        changed = true;
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
    if (changed) {
      this.notifyUpdated(partyId, settlementId);
      await this.sendSystemMessage(
        partyId,
        `✅ ${payment.user?.nickname || '알 수 없음'}님의 입금이 확인되었습니다.`,
      );
      if (completed) {
        await this.sendSystemMessage(partyId, '🎉 모든 정산이 완료되었습니다!');
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
