import { ServiceUnavailableException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { OcrService } from './ocr.service';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

describe('receipt upload cleanup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('deletes the receipt and preserves an OCR service failure', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue();
    const failure = new ServiceUnavailableException('fixture unavailable');
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
  });
});
