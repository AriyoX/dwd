import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database, NightPhoto } from '@dwd/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  discardPhotoTask,
  photoObjectPath,
  photoSlots,
  photoTaskKey,
  readPhotoTask,
  removePhoto,
  savePhotoTask,
  type PhotoTask,
} from '../apps/mobile/src/lib/photo-upload';
import { photoClient } from '../apps/mobile/src/lib/photo-client';
import {
  initialPracticeState,
  practiceReducer,
  practiceTotals,
  readTourProgress,
  saveTourProgress,
  tourKey,
} from '../apps/mobile/src/lib/practice-tour';
import { clearDeletedAccountData } from '../apps/mobile/src/lib/account-cleanup';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const task: PhotoTask = {
  version: 1,
  owner: id(1),
  nightId: id(2),
  id: id(3),
  width: 100,
  height: 80,
  byteSize: 3,
};
const photo = {
  ...task,
  uploadedByUserId: task.owner,
  uploaderName: 'Alex',
  objectPath: photoObjectPath(task),
  mimeType: 'image/jpeg',
  createdAt: '2026-10-05T18:00:00Z',
} as NightPhoto;
function store() {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function connection() {
  const list = vi.fn().mockResolvedValue({ data: [], error: null });
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const rpc = vi.fn().mockResolvedValue({ data: photo, error: null });
  const client = {
    rpc,
    storage: { from: () => ({ list, upload, remove }) },
  } as unknown as SupabaseClient<Database>;
  return { client, list, upload, remove, rpc };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('native photo recovery', () => {
  it('restores only the matching account/night and rejects invalid metadata', () => {
    const storage = store();
    storage.setItem(photoTaskKey(task.owner, task.nightId), JSON.stringify(task));
    expect(readPhotoTask(storage, task.owner, task.nightId)).toEqual(task);
    expect(readPhotoTask(storage, id(9), task.nightId)).toBeNull();
    storage.setItem(photoTaskKey(id(9), task.nightId), JSON.stringify(task));
    expect(() => readPhotoTask(storage, id(9), task.nightId)).toThrow();
    storage.setItem(
      photoTaskKey(task.owner, task.nightId),
      JSON.stringify({ ...task, byteSize: 6 * 1024 * 1024 }),
    );
    expect(() => readPhotoTask(storage, task.owner, task.nightId)).toThrow();
  });
  it('uploads bytes to the canonical path and registers matching immutable metadata', async () => {
    const api = connection();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await savePhotoTask(api.client, task, async () => bytes);
    expect(api.upload).toHaveBeenCalledWith(photoObjectPath(task), bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(api.rpc).toHaveBeenCalledWith(
      'register_night_photo',
      expect.objectContaining({ p_photo_id: task.id, p_night_id: task.nightId, p_byte_size: 3 }),
    );
  });
  it('recovers a lost registration response without uploading again or requiring the local file', async () => {
    const api = connection();
    api.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'network', message: 'Response lost' },
    });
    await expect(
      savePhotoTask(api.client, task, async () => new Uint8Array([1, 2, 3]).buffer),
    ).rejects.toThrow();
    api.list.mockResolvedValue({ data: [{ name: `${task.id}.jpg` }], error: null });
    const read = vi.fn().mockRejectedValue(new Error('Local file unavailable'));
    await expect(savePhotoTask(api.client, task, read)).resolves.toEqual(photo);
    expect(read).not.toHaveBeenCalled();
    expect(api.upload).toHaveBeenCalledOnce();
    expect(api.rpc.mock.calls[0]).toEqual(api.rpc.mock.calls[1]);
  });
  it('does not treat a failed object lookup as an absent object', async () => {
    const api = connection();
    api.list.mockResolvedValue({ data: null, error: new Error('Offline') });
    await expect(savePhotoTask(api.client, task, async () => new ArrayBuffer(3))).rejects.toThrow(
      'Offline',
    );
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it('does not upload a local file whose byte count changed', async () => {
    const api = connection();
    await expect(savePhotoTask(api.client, task, async () => new ArrayBuffer(4))).rejects.toThrow(
      'changed',
    );
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('removes unfinished uploads without requiring a metadata row', async () => {
    const api = connection();
    api.rpc.mockResolvedValue({ data: [], error: null });
    await discardPhotoTask(api.client, task);
    expect(api.remove).toHaveBeenCalledWith([photoObjectPath(task)]);
    expect(api.rpc).toHaveBeenCalledOnce();
    expect(api.rpc).toHaveBeenCalledWith('get_night_photos', { p_night_id: task.nightId });
  });
  it('also removes metadata when an uncertain upload had already registered', async () => {
    const api = connection();
    api.rpc.mockResolvedValueOnce({ data: [photo], error: null });
    await discardPhotoTask(api.client, task);
    expect(api.rpc).toHaveBeenLastCalledWith('delete_night_photo', { p_photo_id: task.id });
  });
  it('keeps metadata available when Storage removal fails', async () => {
    const api = connection();
    api.remove.mockResolvedValue({ data: null, error: new Error('Offline') });
    await expect(removePhoto(api.client, task.id, photoObjectPath(task))).rejects.toThrow();
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it('does not count a recovered pending upload twice against the photo quota', () => {
    expect(photoSlots([photo], task.owner, task)).toBe(1);
    expect(photoSlots([photo], task.owner, { ...task, id: id(4) })).toBe(0);
    expect(photoSlots([photo], id(9), null)).toBe(2);
  });
  it('pins the original token for both RPC and Storage using the actual SDK', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public');
    const headers: string[] = [];
    vi.stubGlobal('fetch', (_input: unknown, init: RequestInit) => {
      headers.push(new Headers(init.headers).get('Authorization') ?? '');
      return Promise.resolve(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    });
    const client = photoClient('original-token', new AbortController().signal);
    await client.rpc('get_night_photos', { p_night_id: task.nightId });
    await client.storage.from('night-memories').list(`${task.nightId}/${task.owner}`);
    expect(headers).toEqual(['Bearer original-token', 'Bearer original-token']);
  });
});

describe('isolated native practice', () => {
  it('requires an acknowledgment outside the plan and confirms only once', () => {
    let state = practiceReducer(initialPracticeState, { type: 'plan', plan: 'chaser' });
    state = practiceReducer(state, { type: 'log', kind: 'drink' });
    expect(practiceTotals(state).drinks).toBe(0);
    state = practiceReducer(state, { type: 'confirm' });
    state = practiceReducer(state, { type: 'confirm' });
    expect(practiceTotals(state).drinks).toBe(1);
    expect(initialPracticeState.entries).toEqual([]);
  });
  it('reserves no bottle inventory until confirmation and restores it on undo', () => {
    const emptyPlan = practiceReducer(initialPracticeState, { type: 'plan', plan: 'chaser' });
    const warning = practiceReducer(emptyPlan, { type: 'log', kind: 'drink', bottleMl: 45 });
    expect(practiceTotals(warning).remainingMl).toBe(750);
    expect(practiceReducer(warning, { type: 'cancel' }).entries).toEqual([]);
    const saved = practiceReducer(warning, { type: 'confirm' });
    expect(practiceTotals(saved).remainingMl).toBe(705);
    expect(practiceTotals(practiceReducer(saved, { type: 'undo' })).remainingMl).toBe(750);
  });
  it('persists only tour position/status and isolates progress between accounts', () => {
    const storage = store();
    saveTourProgress(storage, task.owner, { step: 3, status: 'active' });
    expect(readTourProgress(storage, task.owner)).toEqual({ step: 3, status: 'active' });
    expect(readTourProgress(storage, id(9))).toBeNull();
    saveTourProgress(storage, task.owner, { step: 8, status: 'complete' });
    expect([...storage.values.keys()]).toEqual([tourKey(task.owner)]);
    expect([...storage.values.values()].join('')).not.toContain('entries');
  });
  it('clears photo-task and tour data only for the deleted account', () => {
    const storage = store();
    for (const owner of [task.owner, id(9)]) {
      storage.setItem(photoTaskKey(owner, task.nightId), JSON.stringify({ ...task, owner }));
      saveTourProgress(storage, owner, { step: 2, status: 'skipped' });
    }
    clearDeletedAccountData(storage, task.owner);
    expect([...storage.values.keys()].sort()).toEqual(
      [photoTaskKey(id(9), task.nightId), tourKey(id(9))].sort(),
    );
  });
});
