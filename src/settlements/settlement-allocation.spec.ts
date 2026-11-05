import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Settlement } from './entities/settlement.entity';
import { SettlementsService } from './settlements.service';

function item(id: number, price: number, userIds: number[], quantity = 1) {
  return {
    id,
    name: `품목 ${id}`,
    price,
    quantity,
    members: userIds.map((userId) => ({ userId })),
  };
}

function scenario(items: ReturnType<typeof item>[]) {
  const settlement = {
    id: 8,
    partyId: 9,
    hostId: 1,
    status: 'SELECTING',
    totalAmount: items.reduce(
      (sum, value) => sum + value.price * value.quantity,
      0,
    ),
    items,
  };
  const claim = { affected: 1 };
  const settlementRepository = {
    findOne: jest.fn().mockResolvedValue(settlement),
    update: jest.fn(),
  };
  const memberRepository = {
    findOne: jest.fn().mockResolvedValue({ userId: 2, status: 'APPROVED' }),
  };
  const itemRepository = { find: jest.fn() };
  const paymentRepository = {
    create: jest.fn((value: Partial<SettlementPayment>) => value),
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn((value: Partial<SettlementPayment>) =>
        Promise.resolve(value),
      ),
      update: jest.fn((...args: [unknown, unknown, Partial<Settlement>]) => {
        if (claim.affected) Object.assign(settlement, args[2]);
        return Promise.resolve(claim);
      }),
    },
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
  const chatGateway = {
    sendSystemMessage: jest.fn<Promise<void>, [number, string]>(),
  };
  const service = new SettlementsService(
    settlementRepository as unknown as Repository<Settlement>,
    itemRepository as unknown as Repository<SettlementItem>,
    {} as Repository<SettlementItemMember>,
    paymentRepository as unknown as Repository<SettlementPayment>,
    {
      findOne: jest.fn().mockResolvedValue({ id: 9, hostId: 1 }),
    } as unknown as Repository<Party>,
    memberRepository as unknown as Repository<PartyMember>,
    dataSource as unknown as DataSource,
    chatGateway as unknown as ChatGateway,
  );
  const payments = () =>
    queryRunner.manager.save.mock.calls.map(([value]) => ({
      userId: value.userId,
      amount: value.amount,
      status: value.status,
    }));
  return {
    service,
    settlement,
    settlementRepository,
    memberRepository,
    itemRepository,
    queryRunner,
    dataSource,
    chatGateway,
    claim,
    payments,
  };
}

describe('정산 확정 금액 배분', () => {
  it('10,000원을 세 명에게 나눠도 합계를 보존하고 userId 순으로 나머지를 배분한다', async () => {
    const value = item(1, 10000, [4, 2, 3]);
    const fixture = scenario([value]);

    await fixture.service.confirm(8, 1);

    expect(fixture.payments()).toEqual([
      { userId: 2, amount: 3334, status: 'PENDING' },
      { userId: 3, amount: 3333, status: 'PENDING' },
      { userId: 4, amount: 3333, status: 'PENDING' },
    ]);
    expect(
      fixture.payments().reduce((sum, payment) => sum + payment.amount!, 0),
    ).toBe(10000);
    expect(value.members.map((member) => member.userId)).toEqual([4, 2, 3]);
    expect(fixture.queryRunner.manager.update).toHaveBeenCalledWith(
      Settlement,
      { id: 8, status: 'SELECTING' },
      { status: 'CONFIRMED' },
    );
    expect(fixture.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.settlement.status).toBe('CONFIRMED');
    expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledWith(
      9,
      '__SYS__|SETTLEMENT_CONFIRMED|10000|2:3334,3:3333,4:3333',
    );
  });

  it('수량과 선택 인원이 다른 여러 품목의 분담액을 합산한다', async () => {
    const fixture = scenario([
      item(1, 10000, [4, 2, 3]),
      item(2, 101, [4, 3], 2),
    ]);

    await fixture.service.confirm(8, 1);

    expect(fixture.payments().map((payment) => payment.amount)).toEqual([
      3334, 3434, 3434,
    ]);
    expect(
      fixture.payments().reduce((sum, payment) => sum + payment.amount!, 0),
    ).toBe(10202);
  });

  it('방장 본인 부담은 계산에 포함하되 송금 대상에서 제외한다', async () => {
    const fixture = scenario([item(1, 10000, [3, 1, 2])]);

    await fixture.service.confirm(8, 1);

    expect(fixture.payments()).toEqual([
      { userId: 2, amount: 3333, status: 'PENDING' },
      { userId: 3, amount: 3333, status: 'PENDING' },
    ]);
    expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledWith(
      9,
      '__SYS__|SETTLEMENT_CONFIRMED|10000|2:3333,3:3333',
    );
  });

  it('1원을 세 명에게 배분할 때 0원 분담자는 입금 대기로 남기지 않는다', async () => {
    const fixture = scenario([item(1, 1, [4, 2, 3])]);

    await fixture.service.confirm(8, 1);

    expect(fixture.payments()).toEqual([
      { userId: 2, amount: 1, status: 'PENDING' },
      { userId: 3, amount: 0, status: 'PAID' },
      { userId: 4, amount: 0, status: 'PAID' },
    ]);
    expect(fixture.settlement.status).toBe('CONFIRMED');
    expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { members: [1, 2, 3], price: 1, paymentCount: 2 },
    { members: [1], price: 10000, paymentCount: 0 },
  ])(
    '양수 입금 대상이 없으면 바로 완료한다 ($members)',
    async ({ members, price, paymentCount }) => {
      const fixture = scenario([item(1, price, members)]);

      await fixture.service.confirm(8, 1);

      expect(fixture.payments()).toHaveLength(paymentCount);
      expect(
        fixture.payments().every((payment) => payment.status === 'PAID'),
      ).toBe(true);
      expect(fixture.settlement.status).toBe('COMPLETED');
      expect(
        fixture.chatGateway.sendSystemMessage.mock.calls.map((call) => call[1]),
      ).toEqual([
        expect.stringMatching(/^__SYS__\|SETTLEMENT_CONFIRMED\|/),
        '🎉 모든 정산이 완료되었습니다!',
      ]);
    },
  );

  it.each([{ items: [item(1, 100, [2]), item(2, 50, [])] }, { items: [] }])(
    '미선택 품목이나 빈 정산은 상태와 결제 정보를 바꾸지 않고 거부한다 ($items)',
    async ({ items }) => {
      const fixture = scenario(items);

      await expect(fixture.service.confirm(8, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(fixture.dataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(fixture.settlementRepository.update).not.toHaveBeenCalled();
      expect(fixture.payments()).toEqual([]);
      expect(fixture.settlement.status).toBe('SELECTING');
      expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
    },
  );

  it('이미 다른 요청이 확정한 정산은 결제와 안내를 중복 생성하지 않는다', async () => {
    const fixture = scenario([item(1, 100, [2])]);
    fixture.claim.affected = 0;

    await expect(fixture.service.confirm(8, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(fixture.payments()).toEqual([]);
    expect(fixture.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(fixture.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
  });

  it('결제 저장이 실패하면 확정 트랜잭션을 취소하고 안내를 보내지 않는다', async () => {
    const fixture = scenario([item(1, 100, [2])]);
    fixture.queryRunner.manager.save.mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(fixture.service.confirm(8, 1)).rejects.toThrow('write failed');

    expect(fixture.queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(fixture.queryRunner.release).toHaveBeenCalledTimes(1);
    expect(fixture.chatGateway.sendSystemMessage).not.toHaveBeenCalled();
  });

  it('커밋 뒤 채팅 전송이 실패해도 이미 저장한 정산을 롤백하지 않는다', async () => {
    const fixture = scenario([item(1, 100, [2])]);
    fixture.chatGateway.sendSystemMessage.mockRejectedValueOnce(
      new Error('chat failed'),
    );

    await expect(fixture.service.confirm(8, 1)).rejects.toThrow('chat failed');

    expect(fixture.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(fixture.queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(fixture.queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('송금이 필요 없는 완료 정산을 재확정해도 완료 안내를 중복 생성하지 않는다', async () => {
    const fixture = scenario([item(1, 1, [1, 2, 3])]);

    await fixture.service.confirm(8, 1);
    await expect(fixture.service.confirm(8, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(fixture.payments()).toHaveLength(2);
    expect(fixture.chatGateway.sendSystemMessage).toHaveBeenCalledTimes(2);
    expect(fixture.dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
  });

  it('비방장의 확정은 기존 권한 검사로 거부한다', async () => {
    const fixture = scenario([item(1, 100, [2])]);

    await expect(fixture.service.confirm(8, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(fixture.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('비회원의 선택과 중복 품목 선택은 기존 검사로 거부한다', async () => {
    const fixture = scenario([item(1, 100, [2])]);
    fixture.memberRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      fixture.service.selectItems(8, 3, { itemIds: [1] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    fixture.itemRepository.find.mockResolvedValueOnce([{ id: 1 }]);
    await expect(
      fixture.service.selectItems(8, 2, { itemIds: [1, 1] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fixture.dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
