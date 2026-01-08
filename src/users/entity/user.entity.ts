import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column({type: 'varchar', nullable: true })
    password: string | null;

    @Column()
    nickname: string;

    @Column({ default: 'LOCAL' })
    provider: string;

    @Column({ nullable: true })
    sns_id: string;

    @Column('decimal', { precision: 4, scale: 1, default: 36.5 })
    manner_score: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}