import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Settlement } from './entities/settlement.entity';
import { SettlementsService } from './settlements.service';

function scenario(status = 'CONFIRMED') {
  const items = [
    { id: 20, settlementId: 8, name: '우유', price: 100, quantity: 1 },
  ];
  const settlement = { id: 8, partyId: 9, hostId: 1, status, items };
  const party = { id: 9, hostId: 1 };
  const payments = [
    {
      id: 10,
      settlementId: 8,
      userId: 2,
      amount: 100,
      status: 'PENDING',
      user: {
        id: 2,
        nickname: '멤버',
        password: 'PRIVATE_PASSWORD_MARKER',
        refreshToken: 'PRIVATE_TOKEN_MARKER',
      },
    },
  ];
  const selections = [{ id: 30, itemId: 20, userId: 2 }];
  const approved = new Set([2]);
  const settlementRepository = {
    findOne: jest.fn().mockResolvedValue(settlement),
    update: jest.fn(),
  };
  const memberRepository = {
    findOne: jest.fn(({ where }: { where: { userId: number } }) =>
      Promise.resolve(
        approved.has(where.userId)
          ? { userId: where.userId, status: 'APPROVED' }
          : null,
      ),
    ),
  };
  const manager = {
    findOne: jest.fn(
      (entity: unknown, options?: { where?: { userId?: number } }) => {
        if (entity === Settlement) return Promise.resolve(settlement);
        if (entity === Party) return Promise.resolve(party);
        if (entity === PartyMember) {
          const userId = options?.where?.userId;
          return Promise.resolve(
            userId !== undefined && approved.has(userId)
              ? { userId, status: 'APPROVED' }
              : null,
          );
        }
        return Promise.resolve(payments[0] || null);
      },
    ),
    find: jest.fn(
      (
        entity: unknown,
        options?: { where?: { id?: { value: unknown }; userId?: number } },
      ) => {
        if (entity === SettlementPayment) return Promise.resolve(payments);
        if (entity === SettlementItemMember) {
          return Promise.resolve(
            selections.filter(
              (selection) => selection.userId === options?.where?.userId,
            ),
          );
        }
        const ids = options?.where?.id?.value;
        return Promise.resolve(
          Array.isArray(ids)
            ? items.filter((item) => ids.includes(item.id))
            : items,
        );
      },
    ),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    update: jest.fn(
      (_entity: unknown, _criteria: unknown, changes: Partial<Settlement>) => {
        Object.assign(settlement, changes);
        return Promise.resolve({ affected: 1 });
      },
    ),
    remove: jest.fn((values: { id: number }[]) => {
      for (const value of values) {
        const index = selections.findIndex(
          (selection) => selection.id === value.id,
        );
        if (index !== -1) selections.splice(index, 1);
      }
      return Promise.resolve([]);
    }),
    delete: jest.fn((entity: unknown) => {
      if (entity === SettlementItemMember) selections.length = 0;
      return Promise.resolve({ affected: 1 });
    }),
  };
  const queryRunner = {
    manager,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
  const chatGateway = {
    sendSystemMessage: jest.fn<Promise<void>, [number, string]>(),
  };
  const service = new SettlementsService(
    settlementRepository as unknown as Repository<Settlement>,
    {
      create: jest.fn((value: Partial<SettlementItem>) => value),
    } as unknown as Repository<SettlementItem>,
    {
      create: jest.fn((value: Partial<SettlementItemMember>) => value),
    } as unknown as Repository<SettlementItemMember>,
    {} as Repository<SettlementPayment>,
    {
      findOne: jest.fn().mockResolvedValue(party),
    } as unknown as Repository<Party>,
    memberRepository as unknown as Repository<PartyMember>,
    dataSource as unknown as DataSource,
    chatGateway as unknown as ChatGateway,
  );
  const expectLocked = () =>
    expect(manager.findOne).toHaveBeenCalledWith(Settlement, {
      where: { id: 8 },
      lock: { mode: 'pessimistic_write' },
    });
  return {
    service,
    settlement,
    party,
    payments,
    selections,
    approved,
    manager,
    memberRepository,
    settlementRepository,
    queryRunner,
    dataSource,
    chatGateway,
    expectLocked,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('정산 입금 상태 일관성', () => {
  it.each(['PENDING', 'REFUNDED', ''])(
    '임의 입금 상태 %s는 저장하지 않는다',
    async (status) => {
      const fixture = scenario();
      await expect(
        fixture.service.updatePayment(8, 1, 2, status),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fixture.dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(fixture.payments[0].status).toBe('PENDING');
    },
  );

  it('비방장은 입금을 확인할 수 없다', async () => {
    const fixture = scenario();
    await expect(
      fixture.service.updatePayment(8, 2, 2, 'PAID'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    fixture.expectLocked();
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'SELECTING'])(
    '%s 단계에서는 입금을 변경하지 않는다',
    async (status) => {
      const fixture = scenario(status);
      await expect(
        fixture.service.updatePayment(8, 1, 2, 'PAID'),
      ).rejects.toBeInstanceOf(BadRequestException);
      fixture.expectLocked();
      expect(fixture.manager.save).not.toHaveBeenCalled();
      expect(fixture.queryRunner.commitTransaction).not.toHaveBeenCalled();
    },
  );

  it('마지막 입금과 정산 완료를 함께 저장한 뒤 안내하고 공개 payment를 반환한다', async () => {
    const fixture = scenario();
    const result = await fixture.service.updatePayment(8, 1, 2, 'PAID');
    fixture.expectLocked();
    expect(result.status).toBe('PAID');
    expect(result.amount).toBe(100);
    expect(result.user?.nickname).toBe('멤버');
    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('refreshToken');
    expect(fixture.settlement.status).toBe('COMPLETED');
    expect(fixture.manager.update).toHaveBeenCalledWith(Settlement, 8, {
      status: 'COMPLETED',
    });
    expect(fixture.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(
      fixture.chatGateway.sendSystemMessage.mock.calls.map((call) => call[1]),
    ).toEqual([
      '✅ 멤버님의 입금이 확인되었습니다.',
      '🎉 모든 정산이 완료되었습니다!',
    ]);
    expect(fixture.manager.save.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.manager.update.mock.invocationCallOrder[0],
    );
    expect(fixture.manager.update.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.queryRunner.commitTransaction.mock.invocationCallOrder[0],
    );
    expect(
      fixture.queryRunner.commitTransaction.mock.invocationCallOrder[0],
    ).toBeLessThan(
      fixture.chatGateway.sendSystemMessage.mock.invocationCallOrder[0],
    );
  });

  it('다른 입금이 남으면 확인한 사람만 PAID로 바꾸고 정산은 확정 상태를 유지한다', async () => {
    const fixture = scenario();
    fixture.payments.push({ ...fixture.payments[0], id: 11, userId: 3 });
    await fixture.service.updatePayment(8, 1, 2, 'PAID');
    expect(fixture.payments.map((payment) => payment.status)).toEqual([
      'PAID',
      'PENDING',
    ]);
    expect(fixture.settlement.status).toBe('CONFIRMED');
    expect(fixture.manager.update).not.toHaveBeenCalled();
    expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['CONFIRMED', 'COMPLETED'])(
    '이미 PAID인 %s 정산 요청은 반복해도 안내와 상태 변경이 없다',
    async (status) => {
      const fixture = scenario(status);
      fixture.payments[0].status = 'PAID';
      await fixture.service.updatePayment(8, 1, 2, 'PAID');
      await fixture.service.updatePayment(8, 1, 2, 'PAID');
      fixture.expectLocked();
      expect(fixture.settlement.status).toBe(status);
      expect(fixture.manager.save).not.toHaveBeenCalled();
      expect(fixture.manager.update).not.toHaveBeenCalled();
      expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
    },
  );

  it('완료 정산의 대기 입금은 뒤늦게 변경하지 않는다', async () => {
    const fixture = scenario('COMPLETED');
    await expect(
      fixture.service.updatePayment(8, 1, 2, 'PAID'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.settlement.status).toBe('COMPLETED');
  });

  it('채팅 전송 실패로 저장된 입금과 정산 완료를 되돌리거나 실패 응답으로 바꾸지 않는다', async () => {
    const fixture = scenario();
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    fixture.chatGateway.sendSystemMessage.mockRejectedValue(
      new Error('PRIVATE_CHAT_MARKER'),
    );
    const result = await fixture.service.updatePayment(8, 1, 2, 'PAID');
    expect(result.status).toBe('PAID');
    expect(fixture.settlement.status).toBe('COMPLETED');
    expect(fixture.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      'PRIVATE_CHAT_MARKER',
    );
  });

  it('없는 입금 대상은 생성하지 않는다', async () => {
    const fixture = scenario();
    fixture.payments.length = 0;
    await expect(
      fixture.service.updatePayment(8, 1, 2, 'PAID'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.manager.save).not.toHaveBeenCalled();
  });

  it('입금 저장 실패 시 정산 완료나 안내를 실행하지 않는다', async () => {
    const fixture = scenario();
    fixture.manager.save.mockRejectedValueOnce(new Error('write failure'));
    await expect(
      fixture.service.updatePayment(8, 1, 2, 'PAID'),
    ).rejects.toThrow('write failure');
    expect(fixture.manager.update).not.toHaveBeenCalled();
    expect(fixture.queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(fixture.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
  });
});

describe('잠금 후 정산 단계와 참여자 확인', () => {
  it('잠금 전에 선택 중이었어도 잠금 후 확정됐다면 선택을 저장하지 않는다', async () => {
    const fixture = scenario('CONFIRMED');
    fixture.settlementRepository.findOne.mockResolvedValue({
      ...fixture.settlement,
      status: 'SELECTING',
    });
    await expect(
      fixture.service.selectItems(8, 2, { itemIds: [20] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    fixture.expectLocked();
    expect(fixture.settlementRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.manager.remove).not.toHaveBeenCalled();
    expect(fixture.manager.save).not.toHaveBeenCalled();
  });

  it('선택 목록이 비어 있으면 저장된 본인 선택을 모두 해제한다', async () => {
    const fixture = scenario('SELECTING');
    fixture.selections.push({ id: 31, itemId: 20, userId: 3 });
    await fixture.service.selectItems(8, 2, { itemIds: [] });
    fixture.expectLocked();
    expect(fixture.manager.remove).toHaveBeenCalledTimes(1);
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.selections).toEqual([{ id: 31, itemId: 20, userId: 3 }]);
    expect(fixture.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('멤버 레코드가 없는 기존 방장도 본인 품목을 선택할 수 있다', async () => {
    const fixture = scenario('SELECTING');
    fixture.approved.clear();
    await fixture.service.selectItems(8, 1, { itemIds: [20] });
    fixture.expectLocked();
    expect(fixture.memberRepository.findOne).not.toHaveBeenCalled();
    expect(fixture.manager.save).toHaveBeenCalledWith({
      itemId: 20,
      userId: 1,
    });
  });

  it('방장이 아닌 미승인 사용자는 선택할 수 없다', async () => {
    const fixture = scenario('SELECTING');
    await expect(
      fixture.service.selectItems(8, 3, { itemIds: [20] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.manager.remove).not.toHaveBeenCalled();
    expect(fixture.manager.save).not.toHaveBeenCalled();
  });

  it.each(['items', 'start', 'revert'] as const)(
    '확정된 정산은 %s 작업으로 바꾸지 못한다',
    async (action) => {
      const fixture = scenario('CONFIRMED');
      const request =
        action === 'items'
          ? fixture.service.updateItems(8, 1, {
              items: [{ name: '새 품목', price: 200, quantity: 1 }],
            })
          : action === 'start'
            ? fixture.service.startSelecting(8, 1)
            : fixture.service.revertToDraft(8, 1);
      await expect(request).rejects.toBeInstanceOf(BadRequestException);
      fixture.expectLocked();
      expect(fixture.manager.save).not.toHaveBeenCalled();
      expect(fixture.manager.update).not.toHaveBeenCalled();
      expect(fixture.manager.delete).not.toHaveBeenCalled();
      expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
    },
  );

  it('방장 변경 보정은 잠금에 사용한 매니저로 저장한다', async () => {
    const fixture = scenario();
    fixture.settlement.hostId = 99;
    await fixture.service.updatePayment(8, 1, 2, 'PAID');
    fixture.expectLocked();
    expect(fixture.manager.update).toHaveBeenCalledWith(Settlement, 8, {
      hostId: 1,
    });
    expect(fixture.settlementRepository.update).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'start', before: 'DRAFT', after: 'SELECTING', messages: 1 },
    { action: 'start', before: 'SELECTING', after: 'SELECTING', messages: 0 },
    { action: 'revert', before: 'SELECTING', after: 'DRAFT', messages: 1 },
    { action: 'revert', before: 'DRAFT', after: 'DRAFT', messages: 0 },
  ])(
    '$action은 $before 단계를 $after로 처리하고 반복 안내를 만들지 않는다',
    async ({ action, before, after, messages }) => {
      const fixture = scenario(before);
      if (action === 'start') await fixture.service.startSelecting(8, 1);
      else await fixture.service.revertToDraft(8, 1);
      fixture.expectLocked();
      expect(fixture.settlement.status).toBe(after);
      expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledTimes(
        messages,
      );
      if (action === 'revert' && before === 'SELECTING')
        expect(fixture.selections).toHaveLength(0);
      else expect(fixture.manager.delete).not.toHaveBeenCalled();
    },
  );
});

describe('입금 확인 요청 검증', () => {
  it('양의 정수 사용자와 PAID만 허용한다', async () => {
    expect(
      await validate(
        Object.assign(new UpdatePaymentDto(), { userId: 2, status: 'PAID' }),
      ),
    ).toHaveLength(0);
  });

  it.each([
    { userId: 0, status: 'PAID' },
    { userId: -1, status: 'PAID' },
    { userId: 1.5, status: 'PAID' },
    { userId: '2', status: 'PAID' },
    { userId: 2, status: 'PENDING' },
    { userId: 2, status: 'UNKNOWN' },
  ])('잘못된 요청 $userId/$status는 거부한다', async (request) => {
    expect(
      await validate(Object.assign(new UpdatePaymentDto(), request)),
    ).not.toHaveLength(0);
  });
});
