import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { OcrService, type OcrResult } from './ocr.service';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

describe('receipt upload cleanup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it.each([
    new ServiceUnavailableException('fixture unavailable'),
    new UnprocessableEntityException({
      code: 'OCR_CURRENCY_UNSUPPORTED',
      message: 'KRW only',
    }),
  ])(
    'deletes the receipt and preserves an OCR service failure',
    async (failure) => {
      const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue();
      const controller = new SettlementsController(
        {} as SettlementsService,
        {
          parseReceipt: jest.fn().mockRejectedValue(failure),
        } as unknown as OcrService,
      );
      await expect(
        controller.uploadReceipt({
          path: '/fixture/receipt.png',
        } as Express.Multer.File),
      ).rejects.toBe(failure);
      expect(unlink).toHaveBeenCalledWith('/fixture/receipt.png');
    },
  );

  it.each<OcrResult>([
    {
      storeName: '예시마트',
      items: [{ name: '우유', price: 1500, quantity: 1 }],
      totalPrice: 1500,
      currency: 'KRW',
    },
    {
      storeName: 'テスト店',
      items: [{ name: '牛乳', price: 99, quantity: 2 }],
      totalPrice: 198,
      currency: 'JPY',
    },
    { storeName: 'テスト店', items: [], totalPrice: 198, currency: 'JPY' },
    { storeName: null, items: [], totalPrice: null, currency: 'JPY' },
  ])(
    'preserves receipt currency and totals in success or empty responses',
    async (result) => {
      const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue();
      const parseReceipt = jest.fn().mockResolvedValue(result);
      const controller = new SettlementsController(
        {} as SettlementsService,
        { parseReceipt } as unknown as OcrService,
      );
      expect(
        await controller.uploadReceipt({
          path: '/fixture/receipt.png',
        } as Express.Multer.File),
      ).toMatchObject(result);
      expect(parseReceipt).toHaveBeenCalledWith('/fixture/receipt.png');
      expect(unlink).toHaveBeenCalledTimes(1);
      expect(unlink).toHaveBeenCalledWith('/fixture/receipt.png');
    },
  );

  it('does not mask an OCR error when deleting the temporary upload also fails', async () => {
    const failure = new ServiceUnavailableException('fixture unavailable');
    jest
      .spyOn(fs, 'unlink')
      .mockRejectedValue(new Error('cleanup unavailable'));
    const controller = new SettlementsController(
      {} as SettlementsService,
      {
        parseReceipt: jest.fn().mockRejectedValue(failure),
      } as unknown as OcrService,
    );
    await expect(
      controller.uploadReceipt({
        path: '/fixture/receipt.png',
      } as Express.Multer.File),
    ).rejects.toBe(failure);
  });

  it('does not parse or delete a file when there was no upload', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue();
    const parseReceipt = jest.fn();
    const controller = new SettlementsController(
      {} as SettlementsService,
      { parseReceipt } as unknown as OcrService,
    );
    expect(await controller.uploadReceipt()).toEqual({
      message: '파일이 업로드되지 않았습니다.',
      items: [],
    });
    expect(parseReceipt).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });
});
