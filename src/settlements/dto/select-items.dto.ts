import { ArrayUnique, IsArray, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectItemsDto {
  @ApiProperty({ description: '선택한 품목 ID 리스트', example: [1, 3, 5] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  itemIds: number[];
}
