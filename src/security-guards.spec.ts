import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ChatMessageController } from './chat-message/chat-message.controller';
import { PartyMembersController } from './party-members/party-members.controller';
import { SettlementsController } from './settlements/settlements.controller';

describe('security guard metadata', () => {
  it('파티 멤버와 채팅 API에 클래스 단위 JWT Guard가 적용된다', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PartyMembersController),
    ).toHaveLength(1);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ChatMessageController),
    ).toHaveLength(1);
  });

  it('정산 조회 API에 JWT Guard가 적용된다', () => {
    const findByPartyId = Object.getOwnPropertyDescriptor(
      SettlementsController.prototype,
      'findByPartyId',
    )?.value as object;
    const getPayments = Object.getOwnPropertyDescriptor(
      SettlementsController.prototype,
      'getPayments',
    )?.value as object;

    expect(Reflect.getMetadata(GUARDS_METADATA, findByPartyId)).toHaveLength(1);
    expect(Reflect.getMetadata(GUARDS_METADATA, getPayments)).toHaveLength(1);
  });
});
