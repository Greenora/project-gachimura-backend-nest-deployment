import { parseJapaneseReceiptText } from './japanese-receipt-parser';

describe('parseJapaneseReceiptText', () => {
  it('retains Japanese product text and yen amounts without converting currency', () => {
    expect(
      parseJapaneseReceiptText(
        '例示店\nブレンド S ¥158\n合計 ¥158\nお預り ¥208\nお釣り ¥50',
      ),
    ).toEqual({
      storeName: '例示店',
      items: [{ name: 'ブレンド S', price: 158, quantity: 1 }],
      totalPrice: 158,
    });
  });

  it('uses explicit count and unit price printed below the item', () => {
    const result = parseJapaneseReceiptText(
      '例示店\n内* フライドポテト ¥696\n2コ x 単348\nパン ¥100\n(@100 × 1個)\n合計 ¥796',
    );
    expect(result.items).toEqual([
      { name: 'フライドポテト', price: 348, quantity: 2 },
      { name: 'パン', price: 100, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(796);
  });

  it('does not turn contradictory explicit quantities into a single item price', () => {
    expect(
      parseJapaneseReceiptText('例示店\nパン ¥300\n(@100 × 2個)\n合計 ¥300')
        .items,
    ).toEqual([]);
  });

  it('keeps duplicate purchased rows instead of deduplicating by name and price', () => {
    expect(
      parseJapaneseReceiptText('例示店\nチョコ ¥199\nチョコ ¥199\n合計 ¥398')
        .items,
    ).toEqual([
      { name: 'チョコ', price: 199, quantity: 1 },
      { name: 'チョコ', price: 199, quantity: 1 },
    ]);
  });

  it('handles receipt totals printed before the item section and again after it', () => {
    const result = parseJapaneseReceiptText(
      '例示店\n合計 ¥696\n内税 ¥51\n内* ポテト ¥696\n2コ x 単348\n合計 ¥696\nお預り ¥700\nお釣り ¥4',
    );
    expect(result.items).toEqual([{ name: 'ポテト', price: 348, quantity: 2 }]);
    expect(result.totalPrice).toBe(696);
  });

  it('does not add external taxes or distribute a whole-receipt coupon to item prices', () => {
    const result = parseJapaneseReceiptText(
      '例示店\nうどん ¥1,000\n小計 ¥1,000\n消費税 ¥80\nクーポン ¥100\n合計 ¥980\nクレジット ¥980',
    );
    expect(result.items).toEqual([
      { name: 'うどん', price: 1000, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(980);
  });

  it('normalizes fullwidth yen and digits and leaves product model digits in the name', () => {
    const result = parseJapaneseReceiptText(
      '例示店\n飲料５００ｍｌ ￥１，０００※\n合計 ￥１，０００',
    );
    expect(result.items).toEqual([
      { name: '飲料500ml', price: 1000, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(1000);
  });

  it('rejects broken amounts, signs, zero prices, and number-only names', () => {
    expect(
      parseJapaneseReceiptText(
        '例示店\nパン ¥1,00\n値引 -¥100\n水 ¥0\n1234 ¥100\n合計 ¥0',
      ).items,
    ).toEqual([]);
    expect(
      parseJapaneseReceiptText('例示店\n合計 ¥1,00').totalPrice,
    ).toBeNull();
  });

  it('reads a name followed by its currency-only amount row', () => {
    expect(
      parseJapaneseReceiptText('例示店\nおにぎり\n¥198\n合計\n¥198').items,
    ).toEqual([{ name: 'おにぎり', price: 198, quantity: 1 }]);
  });

  it('reads an explicit @unit-price times count even when 個 is omitted', () => {
    expect(
      parseJapaneseReceiptText('例示店\n外* お茶 ¥300\n(@100×3)\n合計 ¥300')
        .items,
    ).toEqual([{ name: 'お茶', price: 100, quantity: 3 }]);
  });

  it('does not turn trailing negative refund amounts into purchased products', () => {
    expect(
      parseJapaneseReceiptText('例示店\n返品パン ¥100-\nお茶 ¥200\n合計 ¥100')
        .items,
    ).toEqual([{ name: 'お茶', price: 200, quantity: 1 }]);
    expect(
      parseJapaneseReceiptText('例示店\n返品パン − ¥100\n合計 ¥100').items,
    ).toEqual([]);
  });

  it('does not replace a payment total with a later item count or tax total', () => {
    expect(
      parseJapaneseReceiptText(
        '例示店\nお茶 ¥300\n合計 ¥300\n合計点数 3\n合計税額 ¥22',
      ).totalPrice,
    ).toBe(300);
  });

  it('does not use inline tax as the payment total when two money amounts are mixed', () => {
    expect(
      parseJapaneseReceiptText('例示店\n合計 ¥1,000 内税 ¥73').totalPrice,
    ).toBeNull();
    expect(parseJapaneseReceiptText('例示店\n合計 8点 ¥1,000').totalPrice).toBe(
      1000,
    );
  });

  it('uses coordinate rows for products but explicit original total labels for the total', () => {
    const result = parseJapaneseReceiptText('例示店\n合計\n¥198', [
      '例示店',
      'おにぎり ¥198',
      '合計 ¥20',
    ]);
    expect(result.items).toEqual([
      { name: 'おにぎり', price: 198, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(198);
  });

  it('reads a separate item name followed by explicit count, unit price and row amount', () => {
    const result = parseJapaneseReceiptText(
      '例示店\n09*パスタソース\n2コ × 単358 ¥716\n09*炭酸飲料\n2コ × 単55 ¥110\n09 コーヒー ¥348\n外税8%(対象 ¥826) ¥66\n税込小計 ¥1,240\nお買物券 -¥100\n合計 ¥1,140',
    );
    expect(result.items).toEqual([
      { name: 'パスタソース', price: 358, quantity: 2 },
      { name: '炭酸飲料', price: 55, quantity: 2 },
      { name: 'コーヒー', price: 348, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(1140);
  });

  it('does not strip a leading product number without a repeated department-code column', () => {
    expect(
      parseJapaneseReceiptText('例示店\n24缶セット ¥2,400\n合計 ¥2,400').items,
    ).toEqual([{ name: '24缶セット', price: 2400, quantity: 1 }]);
  });

  it('omits a pending item with contradictory printed quantity and row amount', () => {
    expect(
      parseJapaneseReceiptText(
        '例示店\nパスタソース\n2コ × 単358 ¥700\n合計 ¥700',
      ).items,
    ).toEqual([]);
  });

  it('separates a shop name from a phone label printed on the same row', () => {
    expect(
      parseJapaneseReceiptText(
        '毎日お買い得\n例示店 TEL:000-000-0000\nお茶 ¥100\n合計 ¥100',
      ).storeName,
    ).toBe('例示店');
  });

  it('keeps a product ending in a model number pending until its explicit quantity row', () => {
    expect(
      parseJapaneseReceiptText(
        '例示店\n炭酸飲料 160\n2コ × 単55 ¥110\n合計 ¥110',
      ).items,
    ).toEqual([{ name: '炭酸飲料 160', price: 55, quantity: 2 }]);
  });

  it('accepts a printed count unit and multiplication sign even when 単 was not read', () => {
    expect(
      parseJapaneseReceiptText('例示店\nソーセージ ¥598\n2コ X 299\n合計 ¥598')
        .items,
    ).toEqual([{ name: 'ソーセージ', price: 299, quantity: 2 }]);
    expect(
      parseJapaneseReceiptText('例示店\nソーセージ ¥598\n2 X 299\n合計 ¥598')
        .items,
    ).toEqual([{ name: 'ソーセージ', price: 598, quantity: 1 }]);
  });

  it('recognizes a yen sign read as a backslash inside a Japanese receipt', () => {
    expect(
      parseJapaneseReceiptText('例示店\nパン \\100*\n合計 ¥100').items,
    ).toEqual([{ name: 'パン', price: 100, quantity: 1 }]);
  });

  it('removes a spaced 内 marker only when the receipt establishes a tax-marker column', () => {
    expect(
      parseJapaneseReceiptText('例示店\n内* パン ¥100\n内 お茶 ¥200\n合計 ¥300')
        .items,
    ).toEqual([
      { name: 'パン', price: 100, quantity: 1 },
      { name: 'お茶', price: 200, quantity: 1 },
    ]);
    expect(
      parseJapaneseReceiptText('例示店\n内 容器 ¥100\n合計 ¥100').items,
    ).toEqual([{ name: '内 容器', price: 100, quantity: 1 }]);
  });
});
