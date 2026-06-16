import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// DB users 테이블과 매핑되는 엔티티
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true }) // 로그인 ID로 사용
  email: string;

  @Column({ type: 'varchar', length: 512, nullable: true }) // 소셜 로그인은 null
  password?: string | null;

  @Column() // 미입력시 랜덤 생성
  nickname: string;

  @Column({ name: 'nickname_jp', type: 'varchar', nullable: true }) // 일본어 닉네임
  nickname_jp?: string | null;

  @Column({ name: 'profile_image', type: 'varchar', nullable: true })
  profileImage?: string | null;

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber?: string | null;

  @Column({ name: 'birth_date', type: 'datetime', nullable: true })
  birthDate?: Date | null;

  @Column({ name: 'bank_code', type: 'varchar', nullable: true })
  bankCode?: string | null;

  @Column({
    name: 'account_country',
    type: 'varchar',
    length: 2,
    nullable: true,
  })
  accountCountry?: string | null;

  @Column({ name: 'bank_name', type: 'varchar', nullable: true }) // 정산 기능용 (미구현)
  bankName?: string | null;

  @Column({ name: 'bank_branch_name', type: 'varchar', nullable: true })
  bankBranchName?: string | null;

  @Column({ name: 'bank_branch_code', type: 'varchar', nullable: true })
  bankBranchCode?: string | null;

  @Column({ name: 'account_type', type: 'varchar', nullable: true })
  accountType?: string | null;

  @Column({ name: 'account_number', type: 'varchar', nullable: true }) // 정산 기능용 (미구현)
  accountNumber?: string | null;

  @Column({ name: 'account_holder', type: 'varchar', nullable: true })
  accountHolder?: string | null;

  @Column({
    name: 'refresh_token',
    type: 'varchar',
    length: 512,
    nullable: true,
  }) // 토큰 갱신용, 로그아웃시 삭제
  refreshToken?: string | null;

  @Column({ default: 'LOCAL' }) // LOCAL/KAKAO/LINE
  provider: string;

  @Column({ type: 'varchar', nullable: true }) // 소셜 로그인 고유 ID
  sns_id?: string | null;

  @Column('decimal', { precision: 4, scale: 1, default: 50.0 }) // 신뢰 지수
  treeScore: number;

  @Column({ name: 'reviews_count', default: 0 }) // 받은 평가 수
  reviewsCount: number;

  @CreateDateColumn({ name: 'created_at' }) // 가입일시 자동 저장
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' }) // 수정일시 자동 갱신
  updatedAt: Date;

  @Column('decimal', { precision: 10, scale: 8, nullable: true })
  latitude: number | null;

  @Column('decimal', { precision: 11, scale: 8, nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;
}
