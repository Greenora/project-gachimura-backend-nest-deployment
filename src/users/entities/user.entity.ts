import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 512, nullable: true }) // 소셜 로그인은 비번 없음
  password?: string | null;

  @Column()
  nickname: string;

  @Column({ name: 'nickname_jp', nullable: true })
  nickname_jp?: string

  @Column({ name: 'profile_image', nullable: true })
  profileImage?: string;

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber?: string;

  @Column({ name: 'birth_date', type: 'datetime', nullable: true })
  birthDate?: Date;

  @Column({ name: 'bank_name', nullable: true })
  bankName?: string;

  @Column({ name: 'account_number', nullable: true })
  accountNumber?: string;

  @Column({
    name: 'refresh_token',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  refreshToken?: string | null;

  @Column({ default: 'LOCAL' })
  provider: string;

  @Column({ nullable: true })
  sns_id?: string; // 카카오 로그인에서 사용

  @Column('decimal', { precision: 4, scale: 1, default: 36.5 })
  treeScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('decimal', { precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column('decimal', { precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  district: string;
}
