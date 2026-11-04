import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class PushSubscriptions1793750400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'push_subscriptions',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'user_id', type: 'int' },
          { name: 'endpoint_hash', type: 'char', length: '64' },
          { name: 'endpoint', type: 'varchar', length: '4096' },
          { name: 'p256dh', type: 'varchar', length: '128' },
          { name: 'auth', type: 'varchar', length: '64' },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
          },
        ],
        indices: [
          {
            name: 'UQ_push_subscriptions_endpoint_hash',
            columnNames: ['endpoint_hash'],
            isUnique: true,
          },
          { name: 'IDX_push_subscriptions_user_id', columnNames: ['user_id'] },
        ],
        foreignKeys: [
          {
            name: 'FK_push_subscriptions_user',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('push_subscriptions');
  }
}
