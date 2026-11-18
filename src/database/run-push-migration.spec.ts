import type { QueryRunner, Table } from 'typeorm';
import { PushSubscriptions1793750400000 } from './migrations/1793750400000-PushSubscriptions';

jest.mock('./data-source', () => ({
  __esModule: true,
  default: {
    options: {
      type: 'mysql',
      entities: [],
      synchronize: false,
      migrations: ['older-schema-migrations'],
    },
  },
}));
import { pushMigrationSource } from './run-push-migration';

describe('targeted push subscription migration', () => {
  it('runs only the new push migration without replaying older migrations', () => {
    expect(pushMigrationSource.options.migrations).toEqual([
      PushSubscriptions1793750400000,
    ]);
    expect(pushMigrationSource.options.synchronize).toBe(false);
    expect(pushMigrationSource.isInitialized).toBe(false);
  });

  it('creates only a separate table with a short unique hash and user deletion cascade', async () => {
    const createTable = jest
      .fn<Promise<void>, [Table, boolean?]>()
      .mockResolvedValue(undefined);
    await new PushSubscriptions1793750400000().up({
      createTable,
    } as unknown as QueryRunner);
    const table = createTable.mock.calls[0][0];
    expect(table.name).toBe('push_subscriptions');
    expect(table.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columnNames: ['endpoint_hash'],
          isUnique: true,
        }),
      ]),
    );
    expect(table.foreignKeys).toEqual([
      expect.objectContaining({
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    ]);
  });
});
