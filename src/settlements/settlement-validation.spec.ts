import { ValidationPipe } from '@nestjs/common';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { SelectItemsDto } from './dto/select-items.dto';
import {
  MAX_SETTLEMENT_AMOUNT,
  UpdateSettlementItemsDto,
} from './dto/update-settlement-items.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const item = { name: '우유', price: 1000, quantity: 1 };
const validateItems = (items: unknown) =>
  pipe.transform(
    { items },
    { type: 'body', metatype: UpdateSettlementItemsDto },
  );

describe('정산 요청 입력 경계', () => {
  it('상품명 공백을 정리하고 저장 가능한 정수 경계를 허용한다', async () => {
    const result = (await validateItems([
      { ...item, name: '  우유  ', price: MAX_SETTLEMENT_AMOUNT },
      { ...item, price: 0, quantity: MAX_SETTLEMENT_AMOUNT },
    ])) as UpdateSettlementItemsDto;
    expect(result.items.map((value) => value.name)).toEqual(['우유', '우유']);
  });

  it.each([
    { ...item, name: '' },
    { ...item, name: '  ' },
    { ...item, name: '가'.repeat(256) },
    { ...item, price: MAX_SETTLEMENT_AMOUNT + 1 },
    { ...item, quantity: MAX_SETTLEMENT_AMOUNT + 1 },
    { ...item, price: -1 },
    { ...item, quantity: 0 },
    { ...item, price: 1.5 },
    { ...item, quantity: 1.5 },
    { ...item, price: '1000' },
    { ...item, currency: 'JPY' },
  ])('잘못된 품목은 DB에 도달하기 전에 거부한다 (%p)', async (value) => {
    await expect(validateItems([value])).rejects.toThrow();
  });

  it.each([{ itemIds: [] }, { itemIds: [1] }, { itemIds: [1, 2] }])(
    '유효한 품목 선택 $itemIds는 허용한다',
    async ({ itemIds }) => {
      await expect(
        pipe.transform({ itemIds }, { type: 'body', metatype: SelectItemsDto }),
      ).resolves.toMatchObject({ itemIds });
    },
  );

  it.each([
    { itemIds: [1, 1] },
    { itemIds: [0] },
    { itemIds: [-1] },
    { itemIds: [1.5] },
    { itemIds: ['1'] },
    { itemIds: [null] },
  ])(
    '중복 또는 양의 정수가 아닌 선택 $itemIds는 거부한다',
    async ({ itemIds }) => {
      await expect(
        pipe.transform({ itemIds }, { type: 'body', metatype: SelectItemsDto }),
      ).rejects.toThrow();
    },
  );

  it.each([0, -1, 1.5, '1', null])(
    '잘못된 모임 ID %p는 거부한다',
    async (partyId) => {
      await expect(
        pipe.transform(
          { partyId },
          { type: 'body', metatype: CreateSettlementDto },
        ),
      ).rejects.toThrow();
    },
  );
});
