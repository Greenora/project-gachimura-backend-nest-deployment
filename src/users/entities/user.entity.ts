import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true }) // 소셜 로그인은 비번 없음
  password?: string;

  @Column()
  nickname: string;

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

  @Column({ name: 'refresh_token', nullable: true })
  refreshToken?: string;

  @Column({ default: 'LOCAL' }) 
  provider: string;

  @Column({ nullable: true }) 
  sns_id?: string; // 카카오 로그인에서 사용

  @Column('decimal', { precision: 4, scale: 1, default: 36.5 })
  manner_score: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}