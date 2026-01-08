// src/database/seeds/create-initial-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { User } from '../../users/entities/user.entity';
import { Party } from '../../parties/entities/party.entity';
import { PartyMember } from '../../party-members/entities/party-member.entity';
import { ChatMessage } from '../../chat-message/entities/chat-message.entity';
import { DataSource } from 'typeorm';

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

  const user1 = await userRepo.save({
    email: 'hong@test.com',
    nickname: '홍길동',
    provider: 'EMAIL',
    treeScore: 100,
  });

  const user2 = await userRepo.save({
    email: 'kim@test.com',
    nickname: '김철수',
    provider: 'EMAIL',
    treeScore: 85,
  });

  const user3 = await userRepo.save({
    email: 'lee@test.com',
    nickname: '이길동',
    provider: 'EMAIL',
    treeScore: 74,
  });

  console.log('✅ 유저 생성 완료:', user1.nickname, user2.nickname);

  // 2. 모임 생성 (호스트: 홍길동)
  const partyRepo = dataSource.getRepository(Party);
  const party = await partyRepo.save({
    host: user1,
    title: '코스트코 소고기 같이 사요',
    content: '양이 너무 많아서 반 나누실 분 구합니다.',
    storeName: '코스트코 양재점',
    latitude: 37.4626,
    longitude: 127.0375,
    meetDate: new Date('2025-11-12T15:00:00'),
    status: 'RECRUITING',
  });

  console.log('✅ 모임 생성 완료:', party.title);

  // 3. 멤버 참여 (홍길동, 김철수)
  const memberRepo = dataSource.getRepository(PartyMember);
  await memberRepo.save([
    { party, user: user1, status: 'APPROVED' }, // 방장
    { party, user: user2, status: 'APPROVED' }, // 참여자
    { party, user: user3, status: 'APPROVED' }, // 참여자
  ]);

  console.log('✅ 멤버 참여 완료');

  // 4. 초기 채팅 메시지
  const chatRepo = dataSource.getRepository(ChatMessage);
  await chatRepo.save([
    { party, sender: user1, content: '안녕하세요! 고기 나누실 분?' },
    { party, sender: user2, content: '저요! 저도 마침 사려던 참이었어요.' },
  ]);

  console.log('✅ 초기 채팅 생성 완료');
  console.log('🎉 모든 작업이 끝났습니다!');

  await app.close();
}

bootstrap();