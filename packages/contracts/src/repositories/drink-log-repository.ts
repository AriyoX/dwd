import type { DrinkLogCommand, DrinkLogResult, WaterLogResult } from '@dwd/core';

export interface WaterLogCommand {
  targetMemberId: string;
  consumedAt: string;
  idempotencyKey: string;
}

export interface DrinkLogRepository {
  create(input: DrinkLogCommand): Promise<DrinkLogResult>;
  createWater(input: WaterLogCommand): Promise<WaterLogResult>;
  softDelete(logId: string, kind: 'alcohol' | 'water'): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<DrinkLogResult | null>;
}
