// src/database/seeds/create-initial-data.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { User } from '../../users/entities/user.entity';
import { Party } from '../../parties/entities/party.entity';
import { PartyMember } from '../../party-members/entities/party-member.entity';
import { ChatMessage } from '../../chat-message/entities/chat-message.entity';
import { CommunityPost } from '../../community/entities/community-post.entity';
import { CommunityComment } from '../../community/entities/community-comment.entity';
import { CommunityPostLike } from '../../community/entities/community-post-like.entity';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('기존 데이터를 삭제하고 더미 데이터 생성을 시작합니다...');

  // 외래키 제약 조건을 잠시 해제하고 초기화
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  await dataSource.getRepository(CommunityPostLike).clear();
  await dataSource.getRepository(CommunityComment).clear();
  await dataSource.getRepository(CommunityPost).clear();
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
    treeScore: 80,
    latitude: 35.85,
    longitude: 128.62,
    region: '대구광역시',
    district: '수성구'
  });

  const user2 = await userRepo.save({
    email: 'kim@test.com',
    password: hashedPassword,
    nickname: '김철수',
    provider: 'EMAIL',
    treeScore: 65,
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
    treeScore: 50,
    latitude: 35.89,
    longitude: 128.62,
    region: '대구광역시',
    district: '북구'
  });

  const user4 = await userRepo.save({
    email: 'soil@test.com',
    password: hashedPassword,
    nickname: '흙투성이',
    provider: 'EMAIL',
    treeScore: 18,
    latitude: 37.54,
    longitude: 127.05,
    region: '서울특별시',
    district: '성동구'
  });

  console.log('✅ 유저 생성 완료:', user1.nickname, user2.nickname, user3.nickname, user4.nickname);

  // 2. 커뮤니티 게시글 생성
  const communityPostRepo = dataSource.getRepository(CommunityPost);
  const savedCommunityPosts = await communityPostRepo.save([
    {
      author: user1,
      authorId: user1.id,
      content: '대구 북구 쪽 코스트코 장보기 팁 공유해요. #코스트코 #장보기 #꿀팁',
      locale: 'ko',
    },
    {
      author: user2,
      authorId: user2.id,
      content: '서울 중구 근처 장보기 끝! 저녁 시간대 할인 품목 은근 많네요. #이마트 #할인',
      locale: 'ko',
    },
    {
      author: user3,
      authorId: user3.id,
      content: '연어/우유/계란 같이 사면 좋은 조합 추천받아요. #연어 #계란 #장바구니',
      locale: 'ko',
    },
    {
      author: user4,
      authorId: user4.id,
      content: '오늘은 1+1 상품만 골라서 장봤는데 생각보다 절약 많이 됐어요. #1+1 #절약',
      locale: 'ko',
    },
    {
      author: user1,
      authorId: user1.id,
      content: '주말엔 대용량 제품 나눔이 제일 효율 좋네요. #대용량 #나눔',
      locale: 'ko',
    },
    {
      author: user2,
      authorId: user2.id,
      content: '비 오는 날엔 근처 마트만 돌려도 충분히 알뜰하게 장볼 수 있더라고요. #마트 #알뜰',
      locale: 'ko',
    },
    {
      author: user3,
      authorId: user3.id,
      content: '오늘 본 할인 중 제일 괜찮았던 건 냉동식품 코너였어요. #냉동식품 #할인',
      locale: 'ko',
    },
    {
      author: user4,
      authorId: user4.id,
      content: '커뮤니티가 조금 더 북적이면 좋겠어서 첫 글 남깁니다. 다들 장보기 정보 많이 공유해요! #커뮤니티 #첫글',
      locale: 'ko',
    },
    {
      author: user1,
      authorId: user1.id,
      content: '北区のコストコで買い物する時のコツを共有します。 #コストコ #買い物 #節約',
      locale: 'ja',
    },
    {
      author: user2,
      authorId: user2.id,
      content: '夕方のスーパーは割引品が多くて助かります。 #スーパー #割引',
      locale: 'ja',
    },
    {
      author: user3,
      authorId: user3.id,
      content: '大容量ヨーグルトを分けたい人いますか？ #大容量 #シェア',
      locale: 'ja',
    },
    {
      author: user4,
      authorId: user4.id,
      content: '冷凍食品コーナーのセールがかなり良かったです。 #冷凍食品 #割引',
      locale: 'ja',
    },
  ]);

  console.log('✅ 커뮤니티 게시글 생성 완료: 총', savedCommunityPosts.length, '개');

  const communityCommentRepo = dataSource.getRepository(CommunityComment);
  await communityCommentRepo.save([
    {
      post: savedCommunityPosts[0],
      postId: savedCommunityPosts[0].id,
      author: user2,
      authorId: user2.id,
      content: '오 이 팁 좋네요. 오늘 저도 코스트코 갈 예정이었어요.',
      locale: 'ko',
    },
    {
      post: savedCommunityPosts[0],
      postId: savedCommunityPosts[0].id,
      author: user3,
      authorId: user3.id,
      content: '북구 쪽은 주차가 좀 복잡하던데, 시간대 추천 있나요?',
      locale: 'ko',
    },
    {
      post: savedCommunityPosts[2],
      postId: savedCommunityPosts[2].id,
      author: user1,
      authorId: user1.id,
      content: '연어는 냉장보다 냉동이 나을 때도 있더라고요!',
      locale: 'ko',
    },
    {
      post: savedCommunityPosts[4],
      postId: savedCommunityPosts[4].id,
      author: user4,
      authorId: user4.id,
      content: '대용량 제품은 확실히 나눠 사면 체감이 큽니다.',
      locale: 'ko',
    },
    {
      post: savedCommunityPosts[8],
      postId: savedCommunityPosts[8].id,
      author: user2,
      authorId: user2.id,
      content: 'この情報助かります。週末に行く予定でした。',
      locale: 'ja',
    },
    {
      post: savedCommunityPosts[9],
      postId: savedCommunityPosts[9].id,
      author: user3,
      authorId: user3.id,
      content: '夕方の割引は本当に狙い目です。',
      locale: 'ja',
    },
  ]);

  const communityLikeRepo = dataSource.getRepository(CommunityPostLike);
  await communityLikeRepo.save([
    { post: savedCommunityPosts[0], postId: savedCommunityPosts[0].id, user: user2, userId: user2.id },
    { post: savedCommunityPosts[0], postId: savedCommunityPosts[0].id, user: user3, userId: user3.id },
    { post: savedCommunityPosts[1], postId: savedCommunityPosts[1].id, user: user1, userId: user1.id },
    { post: savedCommunityPosts[2], postId: savedCommunityPosts[2].id, user: user2, userId: user2.id },
    { post: savedCommunityPosts[2], postId: savedCommunityPosts[2].id, user: user4, userId: user4.id },
    { post: savedCommunityPosts[4], postId: savedCommunityPosts[4].id, user: user2, userId: user2.id },
    { post: savedCommunityPosts[6], postId: savedCommunityPosts[6].id, user: user1, userId: user1.id },
    { post: savedCommunityPosts[8], postId: savedCommunityPosts[8].id, user: user2, userId: user2.id },
    { post: savedCommunityPosts[8], postId: savedCommunityPosts[8].id, user: user3, userId: user3.id },
    { post: savedCommunityPosts[9], postId: savedCommunityPosts[9].id, user: user1, userId: user1.id },
    { post: savedCommunityPosts[10], postId: savedCommunityPosts[10].id, user: user4, userId: user4.id },
  ]);

  console.log('✅ 커뮤니티 댓글/좋아요 생성 완료');

  // 3. 모임 생성
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
      latitude: 35.885,
      longitude: 128.59,
      meetDate: new Date('2025-11-12T15:00:00'),
      status: 'COMPLETED',
    },
    {
      host: user3,
      title: '대구 코스트코 연어 나눔',
      content: '코스트코 큰 연어 같이 나눠서 구매하실 분!',
      storeName: '코스트코 대구점',
      addressKo: '대구 북구 검단로 97',
      addressJp: 'テグ北区検団路97',
      latitude: 35.90,
      longitude: 128.63,
      meetDate: new Date('2026-03-20T10:00:00'),
      status: 'RECRUITING',
    },
    {
      host: user1,
      title: '이마트 만촌점 계란 1+1',
      content: '계란 1+1 행사하는데 한 판씩 나누실 분 구합니다.',
      storeName: '이마트 만촌점',
      addressKo: '대구 수성구 동원로 136',
      addressJp: 'テグ寿城区동園路136',
      latitude: 35.858,
      longitude: 128.643,
      meetDate: new Date('2026-03-15T18:30:00'),
      status: 'RECRUITING',
    },
    {
      host: user2,
      title: '트레이더스 비산점 베이글',
      content: '베이글 한 봉지씩 나누실 분~ 내일 저녁에 봬요!',
      storeName: '트레이더스 홀세일 클럽 비산점',
      addressKo: '대구 서구 팔달로 128',
      addressJp: 'テグ西区八達路128',
      latitude: 35.891,
      longitude: 128.568,
      meetDate: new Date('2026-03-10T19:00:00'),
      status: 'RECRUITING',
    }
  ]);

  console.log('✅ 모임 생성 완료: 총', savedParties.length, '개');

  // 4. 멤버 참여
  const memberRepo = dataSource.getRepository(PartyMember);
  const partyMembers: any[] = [];
  savedParties.forEach(party => {
    partyMembers.push({ party, user: party.host, status: 'APPROVED' });
  });

  // 첫 번째 파티에 참여자 추가
  partyMembers.push({ party: savedParties[0], user: user2, status: 'APPROVED' });

  await memberRepo.save(partyMembers);

  console.log('✅ 멤버 참여 완료');

  // 5. 초기 채팅 메시지
  const chatRepo = dataSource.getRepository(ChatMessage);
  await chatRepo.save([
    { party: savedParties[0], sender: user1, content: '안녕하세요! 고기 나누실 분?' },
    { party: savedParties[0], sender: user2, content: '저요! 저도 마침 사려던 참이었어요.' },
  ]);

  console.log('✅ 초기 채팅 생성 완료');
  console.log('🎉 모든 작업이 끝났습니다!');

  await app.close();
}

bootstrap();
