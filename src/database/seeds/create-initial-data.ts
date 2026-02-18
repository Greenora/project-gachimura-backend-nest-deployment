// src/database/seeds/create-initial-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { User } from '../../users/entities/user.entity';
import { Party } from '../../parties/entities/party.entity';
import { PartyMember } from '../../party-members/entities/party-member.entity';
import { ChatMessage } from '../../chat-message/entities/chat-message.entity';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('기존 데이터를 삭제하고 더미 데이터 생성을 시작합니다...');

  // 외래키 제약 조건을 잠시 해제하고 초기화
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.getRepository(ChatMessage).clear();
  await dataSource.getRepository(PartyMember).clear();
  await dataSource.getRepository(Party).clear();
  await dataSource.getRepository(User).clear();
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

  // 1. 유저 생성
  const userRepo = dataSource.getRepository(User);
  const hashedPassword = await bcrypt.hash('password123', 10);

  const user1 = await userRepo.save({
    email: 'hong@test.com',
    password: hashedPassword,
    nickname: '코끼리',
    provider: 'EMAIL',
    treeScore: 100,
    latitude: 37.4626,
    longitude: 127.0375,
    region: '대구광역시',
    district: '수성구'
  });

  const user2 = await userRepo.save({
    email: 'kim@test.com',
    password: hashedPassword,
    nickname: '김철수',
    provider: 'EMAIL',
    treeScore: 85,
    latitude: 37.5665,
    longitude: 126.9780,
    region: '서울특별시',
    district: '중구'
  });

  const user3 = await userRepo.save({
    email: 'lee@test.com',
    password: hashedPassword,
    nickname: '기린',
    provider: 'EMAIL',
    treeScore: 74,
    latitude: 35.1796,
    longitude: 129.0756,
    region: '부산광역시',
    district: '연제구'
  });

  console.log('✅ 유저 생성 완료:', user1.nickname, user2.nickname, user3.nickname);

  // 2. 모임 생성
  const partyRepo = dataSource.getRepository(Party);
  const savedParties = await partyRepo.save([
    {
      host: user1,
      title: '코스트코 소고기 같이 사요',
      content: '양이 너무 많아서 반 나누실 분 구합니다.',
      storeName: '코스트코 양재점',
      addressKo: '서울 서초구 양재대로 159',
      addressJp: 'ソウル瑞草区良才大路159',
      latitude: 37.4626,
      longitude: 127.0375,
      meetDate: new Date('2026-11-12T15:00:00'),
      status: 'RECRUITING',
    },
    {
      host: user3,
      title: '이마트에서 1+1 상품 나눠요',
      content: '이마트 1+1 상품 함께 나눠요~',
      storeName: '이마트 칠성점',
      addressKo: '대구 북구 침산로 158',
      addressJp: 'テグ北区砧門路158',
      latitude: 20.4626,
      longitude: 187.0375,
      meetDate: new Date('2025-11-12T15:00:00'),
      status: 'COMPLETED',
    }
  ]);

  const p1 = savedParties[0];
  const p2 = savedParties[1];

  console.log('✅ 모임 생성 완료:', p1.title, p2.title);

  // 3. 멤버 참여
  const memberRepo = dataSource.getRepository(PartyMember);
  await memberRepo.save([
    { party: p1, user: user1, status: 'APPROVED' }, // 방장
    { party: p1, user: user2, status: 'APPROVED' }, // 참여자
    { party: p2, user: user3, status: 'APPROVED' }, // 방장
  ]);

  console.log('✅ 멤버 참여 완료');

  // 4. 초기 채팅 메시지
  const chatRepo = dataSource.getRepository(ChatMessage);
  await chatRepo.save([
    { party: p1, sender: user1, content: '안녕하세요! 고기 나누실 분?' },
    { party: p1, sender: user2, content: '저요! 저도 마침 사려던 참이었어요.' },
  ]);

  console.log('✅ 초기 채팅 생성 완료');
  console.log('🎉 모든 작업이 끝났습니다!');

  await app.close();
}

bootstrap();
