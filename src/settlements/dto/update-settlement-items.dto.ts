import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SettlementItemDto {
  @ApiProperty({ description: '품목명', example: '서울우유 120ml' })
  @IsString()
  name: string;

  @ApiProperty({ description: '가격 (원)', example: 800 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: '수량', example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class UpdateSettlementItemsDto {
  @ApiProperty({ description: '구매 품목 리스트', type: [SettlementItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementItemDto)
  items: SettlementItemDto[];
}
