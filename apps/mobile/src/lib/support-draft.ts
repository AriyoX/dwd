import { z } from 'zod';
import { supportRequestSchema } from '@dwd/data';

export const supportDraftSchema = z.object({
  owner: z.uuid(),
  kind: z.enum(['problem', 'feedback']),
  message: z.string().max(4000),
  attempt: supportRequestSchema.nullable(),
});
export type SupportDraft = z.infer<typeof supportDraftSchema>;
export const supportDraftKey = (owner: string) => `dwd.mobile.support-draft.v1:${owner}`;
export function readSupportDraft(storage: Pick<Storage, 'getItem'>, owner: string): SupportDraft {
  const raw = storage.getItem(supportDraftKey(owner));
  if (!raw) return { owner, kind: 'problem', message: '', attempt: null };
  const parsed = supportDraftSchema.parse(JSON.parse(raw));
  if (parsed.owner !== owner) throw new Error('This draft belongs to another account.');
  return parsed;
}
