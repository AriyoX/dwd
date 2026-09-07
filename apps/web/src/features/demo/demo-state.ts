import { z } from 'zod';

export const DEMO_STORAGE_KEY = 'dwd-demo:v1';
export const demoSchema = z.object({
  version: z.literal(1),
  ended: z.boolean(),
  participants: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().min(1).max(60),
        managed: z.boolean(),
        waterOnly: z.boolean(),
        entries: z.array(z.enum(['beer', 'water'])).max(200),
      }),
    )
    .min(1)
    .max(20),
});
export type DemoState = z.infer<typeof demoSchema>;
export function sampleNight(): DemoState {
  return {
    version: 1,
    ended: false,
    participants: [
      {
        id: 'demo-you',
        name: 'Alex (you)',
        managed: true,
        waterOnly: false,
        entries: ['beer', 'water'],
      },
      { id: 'demo-mika', name: 'Mika', managed: false, waterOnly: false, entries: ['beer'] },
      { id: 'demo-robin', name: 'Robin', managed: true, waterOnly: true, entries: ['water'] },
    ],
  };
}
export function demoLog(state: DemoState, id: string, kind: 'beer' | 'water'): DemoState {
  if (state.ended) return state;
  return {
    ...state,
    participants: state.participants.map((p) =>
      p.id === id && p.managed && p.entries.length < 200 && !(p.waterOnly && kind === 'beer')
        ? { ...p, entries: [...p.entries, kind] }
        : p,
    ),
  };
}
export function readDemo(storage: Pick<Storage, 'getItem'>): DemoState {
  try {
    const result = demoSchema.safeParse(JSON.parse(storage.getItem(DEMO_STORAGE_KEY) ?? 'null'));
    return result.success ? result.data : sampleNight();
  } catch {
    return sampleNight();
  }
}
