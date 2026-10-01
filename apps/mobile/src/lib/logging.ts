import type { DrinkLogCommand, DrinkLogResult } from '@dwd/core';

// A warning retry keeps the timestamp and idempotency key of the original action.
export async function submitDrink(
  command: DrinkLogCommand,
  create: (command: DrinkLogCommand) => Promise<DrinkLogResult>,
  confirm: (message: string) => Promise<boolean>,
): Promise<DrinkLogResult | null> {
  const result = await create(command);
  if (result.status !== 'confirmation_required') return result;
  if (!(await confirm(result.message))) return null;
  return create({
    ...command,
    acknowledgePlanExceeded:
      command.acknowledgePlanExceeded || result.warnings.includes('plan_exceeded'),
    acknowledgeAfterEnd: command.acknowledgeAfterEnd || result.warnings.includes('after_end'),
  });
}
