import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodePhoto, PHOTO_INPUT_ACCEPT } from './decode-photo';
import { prepareEventPhoto } from '../events/prepare-event-photo';
import { prepareImage } from './image-upload';

const converter = vi.hoisted(() => ({ heicTo: vi.fn() }));
vi.mock('heic-to/csp', () => converter);

function heic(major = 'heic', compatible = ['mif1']) {
  const bytes = new Uint8Array(16 + compatible.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode('ftyp' + major), 4);
  compatible.forEach((brand, index) => bytes.set(new TextEncoder().encode(brand), 16 + index * 4));
  return bytes;
}

function bitmap(width = 4032, height = 3024) {
  return { width, height, close: vi.fn() };
}

function imageElement(succeeds = false) {
  const removeAttribute = vi.fn();
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-photo');
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 4032;
      naturalHeight = 3024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      removeAttribute = removeAttribute;
      set src(_value: string) {
        queueMicrotask(() => (succeeds ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  return { revoke, removeAttribute };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('camera photo decoding', () => {
  it('lets Apple convert library selections to JPEG before the site reads them', () => {
    expect(PHOTO_INPUT_ACCEPT.split(',')[0]).toBe('image/jpeg');
    expect(PHOTO_INPUT_ACCEPT).not.toMatch(/hei[cf]|image\/\*/);
  });

  it.each([
    { name: 'IMG_1234.jpg', type: 'image/jpeg' },
    { name: 'IMG_1234.jpg', type: '' },
    { name: 'photo', type: 'application/octet-stream' },
    { name: 'IMG_1234.HEIC', type: 'image/heic' },
  ])('detects real HEIC bytes despite picker metadata: $name / $type', async ({ name, type }) => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported')));
    const image = imageElement();
    const converted = bitmap();
    converter.heicTo.mockResolvedValue(converted);
    const result = await decodePhoto(new File([heic()], name, { type }));
    expect(converter.heicTo).toHaveBeenCalledWith({ blob: expect.any(Blob), type: 'bitmap' });
    expect(converter.heicTo.mock.calls[0]?.[0].blob.type).toBe('image/heic');
    expect(result.source).toBe(converted);
    expect(image.revoke).toHaveBeenCalledWith('blob:test-photo');
    expect(image.removeAttribute).toHaveBeenCalledWith('src');
    result.close();
    expect(converted.close).toHaveBeenCalledOnce();
  });

  it('recognizes a HEIC-compatible brand even when it is not the major brand', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported')));
    imageElement();
    converter.heicTo.mockResolvedValue(bitmap());
    await decodePhoto(new File([heic('xxxx', ['heix'])], 'photo.jpg', { type: 'image/jpeg' }));
    expect(converter.heicTo).toHaveBeenCalledOnce();
  });

  it('uses native HEIC support without loading a conversion', async () => {
    const native = bitmap();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(native));
    const file = new File([heic()], 'photo.heic', { type: 'image/heic' });
    const read = vi.spyOn(file, 'arrayBuffer');
    const result = await decodePhoto(file);
    const source = vi.mocked(createImageBitmap).mock.calls[0]?.[0];
    expect(source).toBeInstanceOf(Blob);
    expect(source).not.toBeInstanceOf(File);
    expect(read).toHaveBeenCalledOnce();
    expect(converter.heicTo).not.toHaveBeenCalled();
    result.close();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it('uses the image load event on Safari without depending on image.decode()', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const image = imageElement(true);
    const result = await decodePhoto(new File([heic()], 'photo.heic', { type: 'image/heic' }));
    expect(result.width).toBe(4032);
    expect(converter.heicTo).not.toHaveBeenCalled();
    expect(image.revoke).not.toHaveBeenCalled();
    result.close();
    expect(image.revoke).toHaveBeenCalledOnce();
  });

  it('recognizes a picker-converted JPEG even if its name still says HEIC', async () => {
    const decode = vi.fn().mockResolvedValue(bitmap());
    vi.stubGlobal('createImageBitmap', decode);
    await decodePhoto(
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.heic', { type: 'image/heic' }),
    );
    expect(decode.mock.calls[0]?.[0].type).toBe('image/jpeg');
    expect(converter.heicTo).not.toHaveBeenCalled();
  });

  it('does not send AVIF files with a shared HEIF brand to the HEIC decoder', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported')));
    imageElement();
    await expect(
      decodePhoto(new File([heic('avif', ['mif1'])], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('Choose it again');
    expect(converter.heicTo).not.toHaveBeenCalled();
  });

  it('reports file-read failures separately from unsupported formats', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    await expect(decodePhoto(file)).rejects.toThrow('could not be read');
  });

  it('reports a corrupt HEIC and releases the failed native image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported')));
    const image = imageElement();
    converter.heicTo.mockRejectedValue(new Error('HEIF processing error'));
    await expect(
      decodePhoto(new File([heic()], 'broken.heic', { type: 'image/heic' })),
    ).rejects.toThrow('Choose it again from your photo library');
    expect(image.revoke).toHaveBeenCalledOnce();
  });

  it('rejects empty, oversized and unsupported selections before decoding', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(decodePhoto(new File([], 'empty.jpg', { type: 'image/jpeg' }))).rejects.toThrow(
      'empty',
    );
    const file = new File(['large'], 'large.heic', { type: 'image/heic' });
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(decodePhoto(file)).rejects.toThrow('50 MB');
    expect(read).not.toHaveBeenCalled();
    await expect(
      decodePhoto(new File(['GIF89a'], 'animation.gif', { type: 'image/gif' })),
    ).rejects.toThrow('Choose a JPEG');
    expect(decode).not.toHaveBeenCalled();
  });

  it('releases images over the pixel limit', async () => {
    const decoded = bitmap(10000, 10000);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(decoded));
    await expect(
      decodePhoto(new File(['image'], 'huge.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('60 megapixels');
    expect(decoded.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['event', prepareEventPhoto, 2048],
    ['memory', prepareImage, 1920],
  ] as const)('prepares a 48 MP iPhone HEIC on a small %s canvas', async (_name, prepare, edge) => {
    const decoded = bitmap(8064, 6048);
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Unsupported')));
    imageElement();
    converter.heicTo.mockResolvedValue(decoded);
    const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback, type: string) => {
        // Model a phone that cannot allocate a full 48 MP intermediate canvas.
        if (canvas.width * canvas.height > 16_777_216) throw new Error('Canvas area exceeded');
        callback(new Blob(['encoded photo'], { type }));
      },
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    const result = await prepare(new File([heic()], 'camera.heic', { type: 'image/heic' }));
    expect(result.width).toBe(edge);
    expect(result.height).toBe(edge * 0.75);
    expect(result.blob.size).toBeLessThan(2 * 1024 * 1024);
    expect(converter.heicTo).toHaveBeenCalledWith({ blob: expect.any(Blob), type: 'bitmap' });
    expect(decoded.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
