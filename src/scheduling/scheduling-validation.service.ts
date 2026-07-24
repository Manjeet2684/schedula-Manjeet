import { BadRequestException, Injectable } from '@nestjs/common';
import { SchedulingType } from './entities/doctor-schedule-config.entity';

@Injectable()
export class SchedulingValidationService {
  toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  normalizeTime(time: string): string {
    const parts = time.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** Postgres TIME often returns `HH:mm:ss` — normalize to `HH:mm`. */
  fromDbTime(time: string): string {
    return this.normalizeTime(String(time).slice(0, 5));
  }

  minutesToTime(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  assertValidSchedulingType(value: string): asserts value is SchedulingType {
    if (value !== SchedulingType.STREAM && value !== SchedulingType.WAVE) {
      throw new BadRequestException(
        `Invalid scheduling type "${value}": must be STREAM or WAVE`,
      );
    }
  }

  assertStreamConfig(slotDuration?: number, bufferTime?: number): void {
    if (slotDuration === undefined || slotDuration === null || slotDuration <= 0) {
      throw new BadRequestException(
        'Invalid slotDuration: must be greater than 0 for STREAM scheduling',
      );
    }
    if (bufferTime !== undefined && bufferTime !== null && bufferTime < 0) {
      throw new BadRequestException(
        'Invalid bufferTime: cannot be negative for STREAM scheduling',
      );
    }
  }

  assertWaveConfig(maxCapacity?: number): void {
    if (maxCapacity === undefined || maxCapacity === null || maxCapacity <= 0) {
      throw new BadRequestException(
        'Invalid maxCapacity: must be greater than 0 for WAVE scheduling',
      );
    }
  }

  /**
   * Past-date / past-slot rule uses the server's local timezone.
   * DATE and TIME columns are wall-clock values with no timezone.
   */
  assertValidCalendarDate(date: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        `Invalid date "${date}": expected YYYY-MM-DD format`,
      );
    }
    const [y, m, d] = date.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() !== y ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      throw new BadRequestException(
        `Invalid date "${date}": not a real calendar date`,
      );
    }
    return parsed;
  }

  assertNotPastSlot(date: string, startTime: string): void {
    const parsed = this.assertValidCalendarDate(date);
    const startMins = this.toMinutes(this.normalizeTime(startTime));
    const slotStart = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      Math.floor(startMins / 60),
      startMins % 60,
    );
    if (slotStart.getTime() <= Date.now()) {
      throw new BadRequestException(
        `Cannot book a past slot: ${date} ${this.normalizeTime(startTime)} is in the past`,
      );
    }
  }

  assertValidTimeRange(startTime: string, endTime: string): void {
    const start = this.toMinutes(startTime);
    const end = this.toMinutes(endTime);
    if (start >= end) {
      throw new BadRequestException(
        `Invalid time range: startTime (${startTime}) must be before endTime (${endTime})`,
      );
    }
  }

  /**
   * True when two half-open intervals [aStart,aEnd) and [bStart,bEnd) overlap.
   */
  timesOverlap(
    aStart: string,
    aEnd: string,
    bStart: string,
    bEnd: string,
  ): boolean {
    const as = this.toMinutes(aStart);
    const ae = this.toMinutes(aEnd);
    const bs = this.toMinutes(bStart);
    const be = this.toMinutes(bEnd);
    return as < be && ae > bs;
  }
}
