import { detectImageMimeType } from './image-upload';

describe('detectImageMimeType', () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
    [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
    ],
    [Buffer.from('RIFF0000WEBP'), 'image/webp'],
  ])('detects an allowed image signature', (buffer, expectedMimeType) => {
    expect(detectImageMimeType(buffer)).toBe(expectedMimeType);
  });

  it('rejects a file disguised as an image', () => {
    expect(detectImageMimeType(Buffer.from('not-an-image'))).toBeNull();
  });
});
