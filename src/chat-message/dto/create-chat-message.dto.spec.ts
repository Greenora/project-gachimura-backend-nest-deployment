import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateChatMessageDto } from './create-chat-message.dto';

describe('CreateChatMessageDto', () => {
  it('공백만 있는 메시지를 거절한다', async () => {
    const dto = plainToInstance(CreateChatMessageDto, {
      partyId: 1,
      content: '   ',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'content')).toBe(true);
  });
});
