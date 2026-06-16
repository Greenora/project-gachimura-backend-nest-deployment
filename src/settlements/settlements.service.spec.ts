import { ForbiddenException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChatGateway } from '../chat/chat.gateway';
import { Party } from '../parties/entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import { SettlementItemMember } from './entities/settlement-item-member.entity';
import { SettlementItem } from './entities/settlement-item.entity';
import { SettlementPayment } from './entities/settlement-payment.entity';
import { Settlement } from './entities/settlement.entity';
import { SettlementsService } from './settlements.service';

describe('SettlementsService', () => {
  it('파티 비멤버의 정산 조회를 거절한다', async () => {
    const findSettlement = jest.fn();
    const settlementRepository = {
      findOne: findSettlement,
    } as unknown as Repository<Settlement>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 8, hostId: 1 }),
    } as unknown as Repository<Party>;
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<PartyMember>;

    const service = new SettlementsService(
      settlementRepository,
      {} as Repository<SettlementItem>,
      {} as Repository<SettlementItemMember>,
      {} as Repository<SettlementPayment>,
      partyRepository,
      memberRepository,
      {} as DataSource,
      {} as ChatGateway,
    );

    await expect(service.findByPartyId(8, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findSettlement).not.toHaveBeenCalled();
  });

  it('정산 관계 사용자들의 민감정보를 제외한다', async () => {
    const settlementRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        partyId: 8,
        hostId: 1,
        host: {
          id: 1,
          nickname: '방장',
          password: 'hashed-password',
          refreshToken: 'hashed-refresh-token',
          treeScore: 50,
          reviewsCount: 0,
        },
        items: [
          {
            id: 1,
            members: [
              {
                userId: 2,
                user: {
                  id: 2,
                  nickname: '멤버',
                  password: 'hashed-password',
                  refreshToken: 'hashed-refresh-token',
                  treeScore: 50,
                  reviewsCount: 0,
                },
              },
            ],
          },
        ],
      }),
    } as unknown as Repository<Settlement>;
    const partyRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 8, hostId: 1 }),
    } as unknown as Repository<Party>;
    const service = new SettlementsService(
      settlementRepository,
      {} as Repository<SettlementItem>,
      {} as Repository<SettlementItemMember>,
      {} as Repository<SettlementPayment>,
      partyRepository,
      {} as Repository<PartyMember>,
      {} as DataSource,
      {} as ChatGateway,
    );

    const settlement = await service.findByPartyId(8, 1);

    expect(settlement?.host).not.toHaveProperty('password');
    expect(settlement?.host).not.toHaveProperty('refreshToken');
    expect(settlement?.items[0].members[0].user).not.toHaveProperty('password');
    expect(settlement?.items[0].members[0].user).not.toHaveProperty(
      'refreshToken',
    );
  });

  it('정산 hostId가 파티 hostId와 달라도 현재 파티 호스트의 품목 수정을 허용하고 보정한다', async () => {
    const updateSettlement = jest.fn().mockResolvedValue({ affected: 1 });
    const settlementRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 8,
          partyId: 9,
          hostId: 1,
          status: 'DRAFT',
        })
        .mockResolvedValueOnce({
          id: 8,
          partyId: 9,
          hostId: 2,
        })
        .mockResolvedValueOnce({
          id: 8,
          partyId: 9,
          hostId: 2,
          host: { id: 2, nickname: '현재 호스트' },
          items: [],
        }),
      update: updateSettlement,
    } as unknown as Repository<Settlement>;
    const itemRepository = {
      create: jest.fn((item) => item),
    } as unknown as Repository<SettlementItem>;
    const partyRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 9, hostId: 2 })
        .mockResolvedValueOnce({ id: 9, hostId: 2 }),
    } as unknown as Repository<Party>;
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        delete: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      },
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;
    const service = new SettlementsService(
      settlementRepository,
      itemRepository,
      {} as Repository<SettlementItemMember>,
      {} as Repository<SettlementPayment>,
      partyRepository,
      {} as Repository<PartyMember>,
      dataSource,
      {} as ChatGateway,
    );

    await service.updateItems(8, 2, {
      items: [{ name: '우유', price: 1000, quantity: 1 }],
    });

    expect(updateSettlement).toHaveBeenCalledWith(8, { hostId: 2 });
    expect(queryRunner.manager.save).toHaveBeenCalledWith({
      settlementId: 8,
      name: '우유',
      price: 1000,
      quantity: 1,
    });
  });
});
