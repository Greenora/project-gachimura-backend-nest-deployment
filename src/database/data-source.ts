import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config({ path: '.env.local' });
config({ path: '.env' });

const port = Number(process.env.DB_PORT ?? 3306);

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port,
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root',
  database: process.env.DB_NAME ?? process.env.DB_DATABASE ?? 'gachimura',
  charset: 'utf8mb4',
  synchronize: false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
