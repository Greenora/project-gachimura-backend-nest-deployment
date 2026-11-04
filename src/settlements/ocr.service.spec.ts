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
    detect.mockResolvedValue([{}]);
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
  it.each([7, 16])('reports provider auth failures (%s)', async (code) => {
    detect.mockRejectedValue({ code, message: privateValue });
    await expectFailure(service(), 'OCR_AUTH_FAILED');
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
  it('retains parsed receipt results without logging receipt text', async () => {
    detect.mockResolvedValue([
      { fullTextAnnotation: { text: '가치마트\n우유 1,500\n결제금액 1,500' } },
    ]);
    expect(await service().parseReceipt('fixture.png')).toEqual({
      storeName: '가치마트',
      items: [{ name: '우유', price: 1500, quantity: 1 }],
      totalPrice: 1500,
    });
    expect(successLog).toHaveBeenCalledWith('OCR_RESULT items=1');
    expect(JSON.stringify(successLog.mock.calls)).not.toContain('가치마트');
  });
});
