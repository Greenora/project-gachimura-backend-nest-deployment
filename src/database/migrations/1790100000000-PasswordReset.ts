import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class PasswordReset1790100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'password_reset_hash',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'password_reset_expires_at',
        type: 'datetime',
        isNullable: true,
      }),
    ]);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'password_reset_expires_at');
    await queryRunner.dropColumn('users', 'password_reset_hash');
  }
}
