import { ConflictException } from '@nestjs/common';
import { SchedulingType } from '../../scheduling/entities/doctor-schedule-config.entity';

export type SuggestedSlotPayload = {
  slotId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  schedulingType: SchedulingType;
};

export class SlotUnavailableException extends ConflictException {
  constructor(suggestedSlot: SuggestedSlotPayload | null) {
    super({
      statusCode: 409,
      message: 'Requested slot is unavailable.',
      error: 'SlotUnavailable',
      suggestedSlot,
    });
  }
}
