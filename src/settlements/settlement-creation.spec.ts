import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Settlement } from './entities/settlement.entity';
import { SettlementsService } from './settlements.service';

function scenario() {
  let existing: Partial<Settlement> | null = null;
  const party = { id: 9, hostId: 1 };
  const manager = {
    findOne: jest.fn((entity: unknown) =>
      Promise.resolve(entity === Party ? party : existing),
    ),
    save: jest.fn((value: Partial<Settlement>) => {
      existing = { id: 8, ...value };
      return Promise.resolve(existing);
    }),
  };
  const transaction = jest.fn((callback: (value: typeof manager) => unknown) =>
    callback(manager),
  );
  const chat = { notifySettlementUpdated: jest.fn() };
  const service = new SettlementsService(
    {
      create: jest.fn((value: Partial<Settlement>) => value),
    } as unknown as Repository<Settlement>,
    {} as Repository<SettlementItem>,
    {} as Repository<SettlementItemMember>,
    {} as Repository<SettlementPayment>,
    {} as Repository<Party>,
    {} as Repository<PartyMember>,
    { transaction } as unknown as DataSource,
    chat as unknown as ChatGateway,
  );
  return { service, manager, chat, party };
}

describe('정산 생성의 권한과 재시도', () => {
  it('방장 재요청은 같은 정산을 반환하고 갱신 알림을 중복 발송하지 않는다', async () => {
    const fixture = scenario();
    const first = await fixture.service.create(1, 9);
    const retried = await fixture.service.create(1, 9);
    expect(retried).toEqual(first);
    expect(fixture.manager.save).toHaveBeenCalledTimes(1);
    expect(fixture.chat.notifySettlementUpdated).toHaveBeenCalledTimes(1);
  });

  it('모임이 없는 요청은 생성하지 않는다', async () => {
    const fixture = scenario();
    fixture.manager.findOne.mockResolvedValueOnce(null);
    await expect(fixture.service.create(1, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.chat.notifySettlementUpdated).not.toHaveBeenCalled();
  });

  it('다른 사용자는 모임의 정산을 생성할 수 없다', async () => {
    const fixture = scenario();
    await expect(fixture.service.create(2, 9)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fixture.manager.save).not.toHaveBeenCalled();
    expect(fixture.chat.notifySettlementUpdated).not.toHaveBeenCalled();
  });

  it('저장 실패는 갱신 알림 없이 호출자에게 전달한다', async () => {
    const fixture = scenario();
    fixture.manager.save.mockRejectedValueOnce(
      new Error('fixture write failed'),
    );
    await expect(fixture.service.create(1, 9)).rejects.toThrow(
      'fixture write failed',
    );
    expect(fixture.chat.notifySettlementUpdated).not.toHaveBeenCalled();
  });
});
