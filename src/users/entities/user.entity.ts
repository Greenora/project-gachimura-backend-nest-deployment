import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true }) // Kakao 유저는 NULL 가능
  password?: string;

  @Column() // 가입 시 랜덤 생성 (not null)
  nickname: string;

  @Column({ name: 'profile_image', nullable: true }) // DB 컬럼명: profile_image
  profileImage?: string;

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber?: string;

  @Column({ name: 'birth_date', type: 'datetime', nullable: true })
  birthDate?: Date;

  @Column({ name: 'bank_name', nullable: true })
  bankName?: string;

  @Column({ name: 'account_number', nullable: true })
  accountNumber?: string;

  @Column({ default: 'EMAIL' }) // "EMAIL" | "KAKAO"
  provider: string;

  @Column({ name: 'refresh_token', nullable: true })
  refreshToken?: string;

  // default 36.5, 소수점 1자리까지
  @Column({ name: 'tree_score', type: 'decimal', precision: 4, scale: 1, default: 36.5 })
  treeScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}