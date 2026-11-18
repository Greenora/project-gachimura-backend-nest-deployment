import {
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const MAX_SETTLEMENT_AMOUNT = 2_147_483_647;

export class SettlementItemDto {
  @ApiProperty({ description: '기존 품목 ID', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @ApiProperty({ description: '품목명', example: '서울우유 120ml' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: '가격 (원)', example: 800 })
  @IsInt()
  @Min(0)
  @Max(MAX_SETTLEMENT_AMOUNT)
  price: number;

  @ApiProperty({ description: '수량', example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_SETTLEMENT_AMOUNT)
  quantity: number;
}

export class UpdateSettlementItemsDto {
  @ApiProperty({ description: '구매 품목 리스트', type: [SettlementItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementItemDto)
  items: SettlementItemDto[];
}
