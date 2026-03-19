import { IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectItemsDto {
  @ApiProperty({ description: '선택한 품목 ID 리스트', example: [1, 3, 5] })
  @IsArray()
  @IsNumber({}, { each: true })
  itemIds: number[];
}
