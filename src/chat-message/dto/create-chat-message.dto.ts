import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateChatMessageDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  partyId: number;

  @ApiProperty({ example: '안녕하세요!' })
  @IsString()
  @Matches(/\S/, { message: '메시지에는 공백이 아닌 문자가 필요합니다.' })
  @MaxLength(2000)
  content: string;
}
