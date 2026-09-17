'use client';

import { useState } from 'react';
import type { MemberSnapshot } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function DrinkChooser({
  member,
  busy,
  onClose,
  onPlanned,
  onEditPlan,
}: {
  member: MemberSnapshot | null;
  busy: boolean;
  onClose: () => void;
  onPlanned: (member: MemberSnapshot, id: string) => void;
  onEditPlan?: (member: MemberSnapshot) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      title={member === null ? 'Another drink' : `Log for ${member.displayName}`}
      onClose={onClose}
    >
      {member && <DrinkChoices key={member.id} member={member} busy={busy} onPlanned={onPlanned} />}
      {member && onEditPlan && (
        <Button
          type="button"
          variant="ghost"
          full
          disabled={busy}
          onClick={() => onEditPlan(member)}
        >
          Edit plan
        </Button>
      )}
    </Dialog>
  );
}

function DrinkChoices({
  member,
  busy,
  onPlanned,
}: {
  member: MemberSnapshot;
  busy: boolean;
  onPlanned: (member: MemberSnapshot, id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const choices = member.planItems.filter((item) => item.archivedAt === null);
  const selected = choices.find((item) => item.id === selectedId);
  return (
    <div className="stack">
      {choices.length === 0 ? (
        <p className="muted small">No drinks in this plan.</p>
      ) : (
        <div className="drink-choice-grid" aria-label="Drinks in your plan">
          {choices.map((item) => (
            <button
              key={item.id}
              type="button"
              className="choice drink-choice"
              disabled={busy}
              aria-pressed={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.label}</strong>
              <span className="small muted">
                {item.volumeMl} ml · {item.abvPercent}%
              </span>
              {item.isQuickLog && <span className="small">Main drink</span>}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <Button type="button" full disabled={busy} onClick={() => onPlanned(member, selected.id)}>
          {busy ? 'Logging…' : `Log ${selected.label}`}
        </Button>
      )}
    </div>
  );
}
