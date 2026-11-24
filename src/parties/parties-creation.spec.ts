import { BadRequestException, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PartiesService } from './parties.service';
import { Party } from './entities/party.entity';
import { PartyMember } from '../party-members/entities/party-member.entity';
import type { ChatGateway } from '../chat/chat.gateway';
import type { PersistedUpload } from '../common/failed-upload-cleanup.interceptor';

describe('party creation commit boundary', () => {
  const dto = {
    title: 'Fixture party',
    meetingDate: '2027-01-01',
    meetingTime: '09:00',
  };

  function fixture() {
    const file = {
      filename: 'fixture.png',
      path: 'uploads/fixture.png',
    } as PersistedUpload;
    const manager = {
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 8 })
        .mockResolvedValueOnce({ id: 9 }),
    };
    const transaction = jest.fn(
      async (operation: (value: typeof manager) => Promise<Party>) => {
        const value = await operation(manager);
        expect(file.persisted).not.toBe(true);
        return value;
      },
    );
    const service = new PartiesService(
      { manager: { transaction } } as unknown as Repository<Party>,
      {} as Repository<PartyMember>,
      {} as ChatGateway,
    );
    return { service, manager, transaction, file };
  }

  it('writes the party and approved host through the same transaction before retaining its photo', async () => {
    const { service, manager, transaction, file } = fixture();
    await expect(service.createWithFile(dto, file, 3)).resolves.toMatchObject({
      id: 8,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenNthCalledWith(
      1,
      Party,
      expect.objectContaining({ hostId: 3, thumbnailImage: 'fixture.png' }),
    );
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      PartyMember,
      expect.objectContaining({ partyId: 8, userId: 3, status: 'APPROVED' }),
    );
    expect(file.persisted).toBe(true);
  });

  it('propagates a failed host write out of the transaction and never retains its photo', async () => {
    const { service, manager, file } = fixture();
    manager.save
      .mockReset()
      .mockResolvedValueOnce({ id: 8 })
      .mockRejectedValueOnce(new Error('fixture-private-database-detail'));
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(service.createWithFile(dto, file, 3)).rejects.toThrow(
        '모임을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
      expect(file.persisted).not.toBe(true);
      expect(warn).toHaveBeenCalledWith('PARTY_CREATE_FAILED');
      expect(log).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it.each([
    [{ ...dto, title: ' ' }, 3],
    [{ ...dto, meetingDate: 'not-a-date' }, 3],
    [dto, 0],
  ])(
    'rejects malformed creation before any transaction',
    async (value, hostId) => {
      const { service, transaction, file } = fixture();
      await expect(
        service.createWithFile(value, file, hostId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
      expect(file.persisted).not.toBe(true);
    },
  );
});
