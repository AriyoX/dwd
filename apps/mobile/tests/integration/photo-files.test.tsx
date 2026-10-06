import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preparePhoto } from '../../src/lib/photo-files';

const runtime = vi.hoisted(() => ({
  copy: vi.fn<() => Promise<void>>(),
  remove: vi.fn(),
  release: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  Directory: class {
    create() {}
  },
  File: class {
    exists = true;
    size = 3;
    copy = runtime.copy;
    delete = runtime.remove;
  },
}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      renderAsync: () =>
        Promise.resolve({
          width: 100,
          height: 80,
          saveAsync: () => Promise.resolve({ uri: 'temporary.jpg', width: 100, height: 80 }),
          release: runtime.release,
        }),
      release: runtime.release,
    }),
  },
}));
const identity = {
  id: '00000000-0000-4000-8000-000000000001',
  owner: '00000000-0000-4000-8000-000000000002',
  nightId: '00000000-0000-4000-8000-000000000003',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('photo preparation file lifetime', () => {
  it('keeps the temporary file until the durable copy finishes', async () => {
    let finishCopy: () => void = () => {};
    let copyStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      copyStarted = resolve;
    });
    runtime.copy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
          copyStarted();
        }),
    );
    const preparing = preparePhoto('picked.jpg', identity);
    await started;
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(runtime.release).not.toHaveBeenCalled();
    finishCopy();
    await expect(preparing).resolves.toMatchObject({ ...identity, byteSize: 3 });
    expect(runtime.remove).toHaveBeenCalledOnce();
    expect(runtime.release).toHaveBeenCalledTimes(3);
  });

  it('reports copy failure and cleans up instead of returning an unusable upload task', async () => {
    runtime.copy.mockRejectedValue(new Error('Disk full'));
    await expect(preparePhoto('picked.jpg', identity)).rejects.toThrow('Disk full');
    expect(runtime.remove).toHaveBeenCalledOnce();
    expect(runtime.release).toHaveBeenCalledTimes(3);
  });
});
