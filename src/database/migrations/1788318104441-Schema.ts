import { MigrationInterface, QueryRunner } from 'typeorm';

export class Schema1788318104441 implements MigrationInterface {
  name = 'Schema1788318104441';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`password\` varchar(512) NULL, \`nickname\` varchar(255) NOT NULL, \`nickname_jp\` varchar(255) NULL, \`profile_image\` varchar(255) NULL, \`phone_number\` varchar(255) NULL, \`birth_date\` datetime NULL, \`bank_code\` varchar(255) NULL, \`account_country\` varchar(2) NULL, \`bank_name\` varchar(255) NULL, \`bank_branch_name\` varchar(255) NULL, \`bank_branch_code\` varchar(255) NULL, \`account_type\` varchar(255) NULL, \`account_number\` varchar(255) NULL, \`account_holder\` varchar(255) NULL, \`refresh_token\` varchar(512) NULL, \`provider\` varchar(255) NOT NULL DEFAULT 'LOCAL', \`sns_id\` varchar(255) NULL, \`treeScore\` decimal(4,1) NOT NULL DEFAULT '50.0', \`reviews_count\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`latitude\` decimal(10,8) NULL, \`longitude\` decimal(11,8) NULL, \`region\` varchar(255) NULL, \`district\` varchar(255) NULL, UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`party_members\` (\`id\` int NOT NULL AUTO_INCREMENT, \`party_id\` int NOT NULL, \`user_id\` int NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'PENDING', \`is_muted\` tinyint NOT NULL DEFAULT 0, \`joined_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`parties\` (\`id\` int NOT NULL AUTO_INCREMENT, \`host_id\` int NOT NULL, \`title\` varchar(255) NOT NULL, \`content\` text NULL, \`thumbnail_image\` varchar(255) NULL, \`store_name\` varchar(255) NULL, \`address\` varchar(255) NULL, \`address_ko\` varchar(255) NULL, \`address_jp\` varchar(255) NULL, \`latitude\` decimal(10,8) NULL, \`longitude\` decimal(11,8) NULL, \`meet_date\` datetime NULL, \`capacity\` int NOT NULL DEFAULT '4', \`current_count\` int NOT NULL DEFAULT '1', \`status\` varchar(255) NOT NULL DEFAULT 'RECRUITING', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`settlement_item_members\` (\`id\` int NOT NULL AUTO_INCREMENT, \`item_id\` int NOT NULL, \`user_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_6cb13a64138d7cee1bbb438e55\` (\`item_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`settlement_items\` (\`id\` int NOT NULL AUTO_INCREMENT, \`settlement_id\` int NOT NULL, \`name\` varchar(255) NOT NULL, \`price\` int NOT NULL, \`quantity\` int NOT NULL DEFAULT '1', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`settlements\` (\`id\` int NOT NULL AUTO_INCREMENT, \`party_id\` int NOT NULL, \`host_id\` int NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'DRAFT', \`total_amount\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`settlement_payments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`settlement_id\` int NOT NULL, \`user_id\` int NOT NULL, \`amount\` int NOT NULL DEFAULT '0', \`status\` varchar(255) NOT NULL DEFAULT 'PENDING', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_5635ed98c6881bbe148744ec7c\` (\`settlement_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`evaluations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`party_id\` int NOT NULL, \`reviewer_id\` int NOT NULL, \`reviewee_id\` int NOT NULL, \`score\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_5f2e720ad6ba891a86ad2dbd32\` (\`party_id\`, \`reviewer_id\`, \`reviewee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`community_posts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`author_id\` int NOT NULL, \`linked_party_id\` int NULL, \`content\` text NOT NULL, \`locale\` varchar(2) NOT NULL DEFAULT 'ko', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`community_post_likes\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`post_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`uq_community_post_like_user_post\` (\`user_id\`, \`post_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`community_comments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`post_id\` int NOT NULL, \`author_id\` int NOT NULL, \`content\` text NOT NULL, \`locale\` varchar(2) NOT NULL DEFAULT 'ko', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`chat_messages\` (\`id\` int NOT NULL AUTO_INCREMENT, \`party_id\` int NOT NULL, \`sender_id\` int NULL, \`content\` text NOT NULL, \`message_type\` varchar(255) NOT NULL DEFAULT 'TALK', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`email_verifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`code_hash\` varchar(128) NOT NULL, \`attempt_count\` int NOT NULL DEFAULT '0', \`expires_at\` datetime NOT NULL, \`verified_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_email_verifications_email_created_at\` (\`email\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`party_members\` ADD CONSTRAINT \`FK_dbbff6593274841bcfc91adbc51\` FOREIGN KEY (\`party_id\`) REFERENCES \`parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`party_members\` ADD CONSTRAINT \`FK_3dcc38b247864e98e3e86e18f6d\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`parties\` ADD CONSTRAINT \`FK_65d10fe3561e05454ff48728bf8\` FOREIGN KEY (\`host_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_item_members\` ADD CONSTRAINT \`FK_3e6567bed7a8f7290b1698bc7e4\` FOREIGN KEY (\`item_id\`) REFERENCES \`settlement_items\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_item_members\` ADD CONSTRAINT \`FK_42ce9a84b4c1933da64c6cc528e\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_items\` ADD CONSTRAINT \`FK_095cc2ffb95a537f308a32a647d\` FOREIGN KEY (\`settlement_id\`) REFERENCES \`settlements\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlements\` ADD CONSTRAINT \`FK_1c408140db989786e7ed37e8ef3\` FOREIGN KEY (\`party_id\`) REFERENCES \`parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlements\` ADD CONSTRAINT \`FK_d86eb1fe2266afbcdfaffb11ac9\` FOREIGN KEY (\`host_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_payments\` ADD CONSTRAINT \`FK_1e90a16c1970b86bf4705126247\` FOREIGN KEY (\`settlement_id\`) REFERENCES \`settlements\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_payments\` ADD CONSTRAINT \`FK_1e955ed8562db28b634c7e9034d\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` ADD CONSTRAINT \`FK_12a347b2d85eb0c894ac9ff7707\` FOREIGN KEY (\`party_id\`) REFERENCES \`parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` ADD CONSTRAINT \`FK_01542288222bb9c75797d996c25\` FOREIGN KEY (\`reviewer_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` ADD CONSTRAINT \`FK_698cb645729ac783e0a40d8d394\` FOREIGN KEY (\`reviewee_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_posts\` ADD CONSTRAINT \`FK_26f27bba71bb08c85b3d10d0c82\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_posts\` ADD CONSTRAINT \`FK_8c3cb907ede6e394589d019d6cd\` FOREIGN KEY (\`linked_party_id\`) REFERENCES \`parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_post_likes\` ADD CONSTRAINT \`FK_16c03c919380e09fbbe292cf790\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_post_likes\` ADD CONSTRAINT \`FK_a4c7e6922204ab726c855b3b089\` FOREIGN KEY (\`post_id\`) REFERENCES \`community_posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_comments\` ADD CONSTRAINT \`FK_a33d7ff95c8e9cffddc6ec8452d\` FOREIGN KEY (\`post_id\`) REFERENCES \`community_posts\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_comments\` ADD CONSTRAINT \`FK_8c8f025c07b8ab29abef7a7b955\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` ADD CONSTRAINT \`FK_d334661eb8331e4742f447a5773\` FOREIGN KEY (\`party_id\`) REFERENCES \`parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` ADD CONSTRAINT \`FK_9e5fc47ecb06d4d7b84633b1718\` FOREIGN KEY (\`sender_id\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` DROP FOREIGN KEY \`FK_9e5fc47ecb06d4d7b84633b1718\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`chat_messages\` DROP FOREIGN KEY \`FK_d334661eb8331e4742f447a5773\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_comments\` DROP FOREIGN KEY \`FK_8c8f025c07b8ab29abef7a7b955\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_comments\` DROP FOREIGN KEY \`FK_a33d7ff95c8e9cffddc6ec8452d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_post_likes\` DROP FOREIGN KEY \`FK_a4c7e6922204ab726c855b3b089\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_post_likes\` DROP FOREIGN KEY \`FK_16c03c919380e09fbbe292cf790\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_posts\` DROP FOREIGN KEY \`FK_8c3cb907ede6e394589d019d6cd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`community_posts\` DROP FOREIGN KEY \`FK_26f27bba71bb08c85b3d10d0c82\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` DROP FOREIGN KEY \`FK_698cb645729ac783e0a40d8d394\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` DROP FOREIGN KEY \`FK_01542288222bb9c75797d996c25\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`evaluations\` DROP FOREIGN KEY \`FK_12a347b2d85eb0c894ac9ff7707\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_payments\` DROP FOREIGN KEY \`FK_1e955ed8562db28b634c7e9034d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_payments\` DROP FOREIGN KEY \`FK_1e90a16c1970b86bf4705126247\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlements\` DROP FOREIGN KEY \`FK_d86eb1fe2266afbcdfaffb11ac9\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlements\` DROP FOREIGN KEY \`FK_1c408140db989786e7ed37e8ef3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_items\` DROP FOREIGN KEY \`FK_095cc2ffb95a537f308a32a647d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_item_members\` DROP FOREIGN KEY \`FK_42ce9a84b4c1933da64c6cc528e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`settlement_item_members\` DROP FOREIGN KEY \`FK_3e6567bed7a8f7290b1698bc7e4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`parties\` DROP FOREIGN KEY \`FK_65d10fe3561e05454ff48728bf8\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`party_members\` DROP FOREIGN KEY \`FK_3dcc38b247864e98e3e86e18f6d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`party_members\` DROP FOREIGN KEY \`FK_dbbff6593274841bcfc91adbc51\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_email_verifications_email_created_at\` ON \`email_verifications\``,
    );
    await queryRunner.query(`DROP TABLE \`email_verifications\``);
    await queryRunner.query(`DROP TABLE \`chat_messages\``);
    await queryRunner.query(`DROP TABLE \`community_comments\``);
    await queryRunner.query(
      `DROP INDEX \`uq_community_post_like_user_post\` ON \`community_post_likes\``,
    );
    await queryRunner.query(`DROP TABLE \`community_post_likes\``);
    await queryRunner.query(`DROP TABLE \`community_posts\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_5f2e720ad6ba891a86ad2dbd32\` ON \`evaluations\``,
    );
    await queryRunner.query(`DROP TABLE \`evaluations\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_5635ed98c6881bbe148744ec7c\` ON \`settlement_payments\``,
    );
    await queryRunner.query(`DROP TABLE \`settlement_payments\``);
    await queryRunner.query(`DROP TABLE \`settlements\``);
    await queryRunner.query(`DROP TABLE \`settlement_items\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_6cb13a64138d7cee1bbb438e55\` ON \`settlement_item_members\``,
    );
    await queryRunner.query(`DROP TABLE \`settlement_item_members\``);
    await queryRunner.query(`DROP TABLE \`parties\``);
    await queryRunner.query(`DROP TABLE \`party_members\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
