import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs';
import { OcrService } from './ocr.service';

jest.mock('@google-cloud/vision', () => ({ ImageAnnotatorClient: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  readFileSync: jest.fn(),
}));

describe('OcrService failures', () => {
  const privateValue = 'PRIVATE_FIXTURE_MUST_NOT_BE_LOGGED';
  const credentials = Buffer.from(
    JSON.stringify({
      project_id: privateValue,
      client_email: privateValue,
      private_key: privateValue,
    }),
  ).toString('base64');
  const detect = jest.fn();
  let errorLog: jest.SpyInstance;
  let successLog: jest.SpyInstance;

  const service = (
    values: Record<string, string> = {
      GOOGLE_VISION_CREDENTIALS_BASE64: credentials,
    },
  ) =>
    new OcrService({
      get: (name: string) => values[name],
    } as unknown as ConfigService);
  async function expectFailure(
    instance: OcrService,
    code: string,
    status = 503,
  ) {
    let caught: unknown;
    try {
      await instance.parseReceipt('fixture.png');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const exception = caught as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
    expect(JSON.stringify(exception.getResponse())).not.toContain(privateValue);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateValue);
    return exception.getResponse();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    successLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fixture image'));
    jest.mocked(ImageAnnotatorClient).mockImplementation(
      () =>
        ({
          documentTextDetection: detect,
        }) as unknown as ImageAnnotatorClient,
    );
    detect.mockReset().mockResolvedValue([{}]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports absent configuration instead of a successful empty recognition', async () => {
    await expectFailure(service({}), 'OCR_NOT_CONFIGURED');
    expect(detect).not.toHaveBeenCalled();
  });
  it.each([
    'not-json',
    'null',
    '{}',
    '{"project_id":123}',
    '{"private_key":"' + privateValue,
  ])(
    'rejects malformed credentials without logging JSON or error text',
    async (value) => {
      await expectFailure(
        service({
          GOOGLE_VISION_CREDENTIALS_BASE64:
            Buffer.from(value).toString('base64'),
        }),
        'OCR_INVALID_CREDENTIALS',
      );
    },
  );
  it('reports SDK construction failure safely for file credentials too', async () => {
    jest.mocked(ImageAnnotatorClient).mockImplementation(() => {
      throw new Error(privateValue);
    });
    await expectFailure(
      service({ GOOGLE_APPLICATION_CREDENTIALS: '/fixture.json' }),
      'OCR_INVALID_CREDENTIALS',
    );
  });
  it('reports unreadable files without calling the provider', async () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error(privateValue);
    });
    await expectFailure(service(), 'OCR_FILE_UNREADABLE');
    expect(detect).not.toHaveBeenCalled();
  });
  it.each([
    [7, 'PERMISSION_DENIED'],
    [16, 'UNAUTHENTICATED'],
  ])('reports provider auth failures (%s)', async (code, reason) => {
    detect.mockRejectedValue({ code, message: privateValue });
    expect(await expectFailure(service(), 'OCR_AUTH_FAILED')).toMatchObject({
      reason,
    });
  });
  it.each(['BILLING_DISABLED', 'SERVICE_DISABLED', 'IAM_PERMISSION_DENIED'])(
    'keeps only the structured provider reason %s without metadata',
    async (reason) => {
      detect.mockRejectedValue({
        code: 7,
        reason,
        message: privateValue,
        errorInfoMetadata: { consumer: privateValue, service: privateValue },
      });
      expect(await expectFailure(service(), 'OCR_AUTH_FAILED')).toMatchObject({
        reason,
      });
      expect(errorLog).toHaveBeenCalledWith(`OCR_AUTH_FAILED reason=${reason}`);
    },
  );
  it('does not expose unknown provider reasons or inspect raw error text', async () => {
    detect.mockRejectedValue({
      code: 7,
      reason: privateValue,
      message: `SERVICE_DISABLED ${privateValue}`,
      errorInfoMetadata: { reason: privateValue },
    });
    expect(await expectFailure(service(), 'OCR_AUTH_FAILED')).toMatchObject({
      reason: 'PERMISSION_DENIED',
    });
  });
  it.each([4, 14, 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'])(
    'reports provider connection failures (%s)',
    async (code) => {
      detect.mockRejectedValue({ code, message: privateValue });
      await expectFailure(service(), 'OCR_CONNECTION_FAILED');
    },
  );
  it('checks image-level errors even when the SDK call resolves', async () => {
    detect.mockResolvedValue([{ error: { code: 3, message: privateValue } }]);
    await expectFailure(service(), 'OCR_PROVIDER_ERROR', 502);
  });
  it('does not expose unexpected provider errors', async () => {
    detect.mockRejectedValue(new Error(privateValue));
    await expectFailure(service(), 'OCR_PROVIDER_ERROR', 502);
  });
  it('keeps a genuine no-text result separate from provider failures', async () => {
    expect(await service().parseReceipt('fixture.png')).toEqual({
      storeName: null,
      items: [],
      totalPrice: null,
    });
    expect(errorLog).not.toHaveBeenCalled();
  });
  it.each(['', ' \n\t '])(
    'keeps an empty text annotation separate from a service failure',
    async (text) => {
      detect.mockResolvedValue([{ fullTextAnnotation: { text } }]);
      expect(await service().parseReceipt('fixture.png')).toEqual({
        storeName: null,
        items: [],
        totalPrice: null,
      });
      expect(detect).toHaveBeenCalledTimes(1);
      expect(errorLog).not.toHaveBeenCalled();
    },
  );
  it('retains parsed receipt results without logging receipt text', async () => {
    detect.mockResolvedValue([
      { fullTextAnnotation: { text: '가치마트\n우유 1,500\n결제금액 1,500' } },
    ]);
    expect(await service().parseReceipt('fixture.png')).toEqual({
      storeName: '가치마트',
      items: [{ name: '우유', price: 1500, quantity: 1 }],
      totalPrice: 1500,
      currency: 'KRW',
    });
    expect(successLog).toHaveBeenCalledWith('OCR_RESULT items=1');
    expect(JSON.stringify(successLog.mock.calls)).not.toContain('가치마트');
    expect(detect).toHaveBeenCalledWith({
      image: { content: Buffer.from('fixture image') },
      imageContext: { languageHints: ['ko', 'en'] },
    });
  });

  it.each([
    '商品 ¥395\n合計 ¥395',
    '商品 ￥395\n合計 ￥395',
    '商品 395 円\n원 395',
    '領 収 書\n合 計 395',
    'Coffee 100\nTotal JPY100',
    'Coffee 100\nTotal jpy 100',
    'Coffee 100\nTotal 100JPY',
    'Coffee 100\nTotal 100¥',
  ])(
    'recognizes yen receipts with a Japanese-only second pass',
    async (text) => {
      detect
        .mockResolvedValueOnce([{ fullTextAnnotation: { text } }])
        .mockResolvedValueOnce([
          {
            fullTextAnnotation: {
              text: 'テスト店\n牛乳 ¥198\n@99×2個\n合計 ¥198',
            },
          },
        ]);
      expect(await service().parseReceipt('fixture.png')).toEqual({
        storeName: 'テスト店',
        items: [{ name: '牛乳', price: 99, quantity: 2 }],
        totalPrice: 198,
        currency: 'JPY',
      });
      expect(detect).toHaveBeenCalledTimes(2);
      for (const [index, languageHints] of [
        ['ko', 'en'],
        ['ja', 'en'],
      ].entries()) {
        expect(detect).toHaveBeenNthCalledWith(index + 1, {
          image: { content: Buffer.from('fixture image') },
          imageContext: { languageHints },
        });
      }
      expect(successLog).toHaveBeenCalledWith(
        'OCR_RESULT currency=JPY items=1',
      );
      expect(JSON.stringify(successLog.mock.calls)).not.toContain('牛乳');
    },
  );

  it('keeps an adjacent lowercase ISO yen result out of the KRW branch', async () => {
    detect.mockResolvedValue([
      { fullTextAnnotation: { text: 'Coffee 100\nTotal jpy100' } },
    ]);
    expect(await service().parseReceipt('fixture.png')).toMatchObject({
      currency: 'JPY',
    });
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it.each([
    'Item $12\nTOTAL $12',
    'Item USD 12',
    'Item EUR 12',
    'Item €12',
    '商品 CNY 12',
    '商品 RMB 12',
    '商品 12元',
    'Item 1,200\nTOTAL 1,200 USD',
    'Item 1,200\nTOTAL 1,200eur',
    'Item 1,200\nTOTAL 1,200 CNY',
    'Item 1,200\nTOTAL 1,200 RMB',
    'Item 1,200\nTOTAL 1,200 GBP',
    'Item 1,200\nTOTAL 1,200$',
    'Item 1,200\nTOTAL 1,200€',
    'Item 1,200\nTOTAL 1,200£',
  ])('rejects other currencies before a Japanese retry', async (text) => {
    detect.mockResolvedValue([{ fullTextAnnotation: { text } }]);
    await expectFailure(service(), 'OCR_CURRENCY_UNSUPPORTED', 422);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(successLog).not.toHaveBeenCalled();
  });

  it('preserves a provider failure during the Japanese pass without a won fallback', async () => {
    detect
      .mockResolvedValueOnce([
        { fullTextAnnotation: { text: '領収書\n牛乳 ¥198\n合計 ¥198' } },
      ])
      .mockRejectedValueOnce({ code: 14, message: privateValue });
    await expectFailure(service(), 'OCR_CONNECTION_FAILED');
    expect(detect).toHaveBeenCalledTimes(2);
    expect(successLog).not.toHaveBeenCalled();
  });

  it('preserves an image-level failure during the Japanese pass without a won fallback', async () => {
    detect
      .mockResolvedValueOnce([
        { fullTextAnnotation: { text: '領収書\n牛乳 ¥198\n合計 ¥198' } },
      ])
      .mockResolvedValueOnce([{ error: { code: 3, message: privateValue } }]);
    await expectFailure(service(), 'OCR_PROVIDER_ERROR', 502);
    expect(detect).toHaveBeenCalledTimes(2);
    expect(successLog).not.toHaveBeenCalled();
  });

  it('keeps an empty Japanese follow-up marked as yen instead of returning the first-pass amounts as won', async () => {
    detect
      .mockResolvedValueOnce([
        { fullTextAnnotation: { text: '領収書\n牛乳 ¥198\n合計 ¥198' } },
      ])
      .mockResolvedValueOnce([{}]);
    expect(await service().parseReceipt('fixture.png')).toEqual({
      storeName: null,
      items: [],
      totalPrice: null,
      currency: 'JPY',
    });
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it.each(['우유 1,500\n결제금액 1,500원', 'Item USD 12'])(
    'rejects a conflicting Japanese follow-up instead of returning won items',
    async (text) => {
      detect
        .mockResolvedValueOnce([
          { fullTextAnnotation: { text: '領収書\n合計 ¥198' } },
        ])
        .mockResolvedValueOnce([{ fullTextAnnotation: { text } }]);
      await expectFailure(service(), 'OCR_CURRENCY_UNSUPPORTED', 422);
      expect(detect).toHaveBeenCalledTimes(2);
      expect(successLog).not.toHaveBeenCalled();
    },
  );

  it('does not treat a currency code inside a product name as a currency amount', async () => {
    detect.mockResolvedValue([
      {
        fullTextAnnotation: {
          text: '예시마트\nUSD Edition 케이블 1,200\n결제금액 1,200원',
        },
      },
    ]);
    expect(await service().parseReceipt('fixture.png')).toMatchObject({
      items: [{ name: 'USD Edition 케이블', price: 1200, quantity: 1 }],
      totalPrice: 1200,
      currency: 'KRW',
    });
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('keeps a Japanese product name on a Korean receipt without treating it as a currency marker', async () => {
    detect.mockResolvedValue([
      {
        fullTextAnnotation: {
          text: '예시마트\n말차 Matcha 抹茶 1,500\n결제금액 1,500원',
        },
      },
    ]);
    expect(await service().parseReceipt('fixture.png')).toMatchObject({
      items: [{ name: '말차 Matcha 抹茶', price: 1500, quantity: 1 }],
      totalPrice: 1500,
      currency: 'KRW',
    });
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('실제 응답의 붙은 열과 낮은 신뢰도 숫자를 구분해 일곱 품목·30720원을 보존한다', async () => {
    // 상품 표의 좌표만 남긴 실제 응답. 상호·연락처·결제정보는 포함하지 않는다.
    const fixture = JSON.parse(
      jest
        .requireActual<typeof fs>('fs')
        .readFileSync(
          `${__dirname}/fixtures/receipt-table.vision.json`,
          'utf8',
        ),
    ) as unknown;
    detect.mockResolvedValue([{ fullTextAnnotation: fixture }]);
    const result = await service().parseReceipt('fixture.png');
    expect(result.items).toEqual([
      { name: '띠 모스 카토 750m', price: 9800, quantity: 1 },
      { name: '스 믹스 보드카 700ml', price: 6980, quantity: 1 },
      { name: '생 삼치 ( 20S )', price: 3400, quantity: 1 },
      { name: '깐 마늘', price: 990, quantity: 1 },
      { name: 'EF 양파', price: 990, quantity: 1 },
      { name: '어린 잎 & 믹스 채소', price: 3580, quantity: 1 },
      { name: '한끼 에 하나씩 양상추', price: 4980, quantity: 1 },
    ]);
    expect(result.totalPrice).toBe(30720);
    expect(
      result.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    ).toBe(30720);
  });

  it('reconstructs receipt columns from positioned words before parsing items', async () => {
    const rows: Array<Array<[string, number]>> = [
      [['예시마트', 0]],
      [
        ['직원명', 0],
        ['0008', 140],
      ],
      [
        ['상', 0],
        ['품', 12],
        ['명', 24],
        ['단', 140],
        ['가', 152],
        ['수', 240],
        ['량', 252],
        ['금', 340],
        ['액', 352],
      ],
      [
        ['우유', 0],
        ['1,500', 140],
        ['2', 240],
        ['3,000', 340],
      ],
      [
        ['부', 0],
        ['가', 12],
        ['세', 24],
        ['273', 340],
      ],
      [
        ['받', 0],
        ['을', 12],
        ['금', 24],
        ['액', 36],
        ['3,000', 340],
      ],
      [
        ['예시직원', 0],
        ['4321', 140],
      ],
    ];
    const paragraphs = rows
      .map((row, rowIndex) => ({
        words: row
          .map(([text, x]) => {
            const y = rowIndex * 24;
            const width = text.length * 10;
            return {
              symbols: [...text].map((text) => ({ text })),
              boundingBox: {
                vertices: [
                  { x, y },
                  { x: x + width, y },
                  { x: x + width, y: y + 12 },
                  { x, y: y + 12 },
                ],
              },
            };
          })
          .reverse(),
      }))
      .reverse();
    const receiptMarker = 'PRIVATE_RECEIPT_MUST_NOT_BE_LOGGED';
    detect.mockResolvedValue([
      {
        fullTextAnnotation: {
          text: `${receiptMarker}\n예시직원 4321\n받을 금액 3,000\n우유 2개 3,000`,
          pages: [{ blocks: [{ paragraphs }] }],
        },
      },
    ]);

    expect(await service().parseReceipt('fixture.png')).toEqual({
      storeName: '예시마트',
      items: [{ name: '우유', price: 1500, quantity: 2 }],
      totalPrice: 3000,
      currency: 'KRW',
    });
    expect(successLog).toHaveBeenCalledWith('OCR_RESULT items=1');
    for (const value of [receiptMarker, '예시마트', '예시직원', privateValue]) {
      expect(
        JSON.stringify([successLog.mock.calls, errorLog.mock.calls]),
      ).not.toContain(value);
    }
  });

  it('keeps tilted numeric columns with their own product instead of the following row', async () => {
    const rows: Array<Array<[string, number]>> = [
      [['예시마트', 0]],
      [
        ['상품명', 0],
        ['단가', 140],
        ['수량', 240],
        ['금액', 340],
      ],
      [
        ['우유', 0],
        ['1,500', 140],
        ['1', 240],
        ['1,500', 340],
      ],
      [
        ['빵', 0],
        ['2,000', 140],
        ['1', 240],
        ['2,000', 340],
      ],
      [
        ['치즈', 0],
        ['2,500', 140],
        ['1', 240],
        ['2,500', 340],
      ],
      [
        ['합계', 0],
        ['6,000', 340],
      ],
    ];
    const slope = 0.08;
    const paragraphs = rows.map((row, rowIndex) => ({
      words: row.map(([text, x]) => {
        const y = rowIndex * 24 + slope * x;
        const width = text.length * 8;
        return {
          symbols: [...text].map((text) => ({ text })),
          boundingBox: {
            vertices: [
              { x, y },
              { x: x + width, y: y + slope * width },
              { x: x + width, y: y + slope * width + 8 },
              { x, y: y + 8 },
            ],
          },
        };
      }),
    }));
    detect.mockResolvedValue([
      {
        fullTextAnnotation: {
          text: '예시마트\n상품명 단가 수량 금액\n우유\n빵\n치즈\n합계 6,000',
          pages: [{ blocks: [{ paragraphs }] }],
        },
      },
    ]);
    expect(await service().parseReceipt('fixture.png')).toMatchObject({
      items: [
        { name: '우유', price: 1500, quantity: 1 },
        { name: '빵', price: 2000, quantity: 1 },
        { name: '치즈', price: 2500, quantity: 1 },
      ],
      totalPrice: 6000,
      currency: 'KRW',
    });
  });
});
