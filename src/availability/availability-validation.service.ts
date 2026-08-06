import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';

export type TimeWindow = {
  startTime: string;
  endTime: string;
};

@Injectable()
export class AvailabilityValidationService {
  /** Normalize HH:mm or HH:mm:ss → minutes since midnight. */
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
   * Past-date rule: compare calendar dates in the server's local timezone
   * using YYYY-MM-DD strings (DATE column has no timezone).
   */
  assertValidOverrideDate(date: string): void {
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

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (parsed < today) {
      throw new BadRequestException(
        `Invalid date "${date}": override date cannot be in the past`,
      );
    }
  }

  assertNoDuplicate(
    candidate: TimeWindow,
    existing: TimeWindow[],
    contextLabel: string,
  ): void {
    const cStart = this.normalizeTime(candidate.startTime);
    const cEnd = this.normalizeTime(candidate.endTime);

    const duplicate = existing.some(
      (slot) =>
        this.normalizeTime(slot.startTime) === cStart &&
        this.normalizeTime(slot.endTime) === cEnd,
    );

    if (duplicate) {
      throw new ConflictException(
        `Duplicate availability entry for ${contextLabel}: ${cStart}–${cEnd} already exists`,
      );
    }
  }

  assertNoOverlap(
    candidate: TimeWindow,
    existing: TimeWindow[],
    contextLabel: string,
  ): void {
    const cStart = this.toMinutes(candidate.startTime);
    const cEnd = this.toMinutes(candidate.endTime);

    for (const slot of existing) {
      const sStart = this.toMinutes(slot.startTime);
      const sEnd = this.toMinutes(slot.endTime);
      const overlaps = cStart < sEnd && cEnd > sStart;
      if (overlaps) {
        throw new ConflictException(
          `Overlapping time slots for ${contextLabel}: ${this.normalizeTime(candidate.startTime)}–${this.normalizeTime(candidate.endTime)} overlaps existing ${this.normalizeTime(slot.startTime)}–${this.normalizeTime(slot.endTime)}`,
        );
      }
    }
  }

  /**
   * Shared create/update check for both recurring and custom windows.
   * Skipped when isUnavailable=true (full-day block — times are ignored).
   */
  validateWindowAgainstExisting(
    candidate: TimeWindow,
    existing: TimeWindow[],
    contextLabel: string,
    options?: { skipTimeChecks?: boolean },
  ): void {
    if (options?.skipTimeChecks) {
      return;
    }

    this.assertValidTimeRange(candidate.startTime, candidate.endTime);
    this.assertNoDuplicate(candidate, existing, contextLabel);
    this.assertNoOverlap(candidate, existing, contextLabel);
  }

  /**
   * Expansion must be a strict superset of the current window:
   * newStart <= currentStart AND newEnd >= currentEnd,
   * and at least one bound must actually move outward.
   */
  assertStrictSupersetExpansion(
    current: TimeWindow,
    proposed: TimeWindow,
  ): void {
    const curStart = this.toMinutes(this.normalizeTime(current.startTime));
    const curEnd = this.toMinutes(this.normalizeTime(current.endTime));
    const newStart = this.toMinutes(this.normalizeTime(proposed.startTime));
    const newEnd = this.toMinutes(this.normalizeTime(proposed.endTime));

    this.assertValidTimeRange(
      this.normalizeTime(proposed.startTime),
      this.normalizeTime(proposed.endTime),
    );

    if (newStart > curStart || newEnd < curEnd) {
      throw new BadRequestException(
        `Invalid expansion: new window (${this.normalizeTime(proposed.startTime)}–${this.normalizeTime(proposed.endTime)}) must fully contain the current window (${this.normalizeTime(current.startTime)}–${this.normalizeTime(current.endTime)}); shrinking or shifting inward is not allowed`,
      );
    }

    if (newStart === curStart && newEnd === curEnd) {
      throw new BadRequestException(
        'Invalid expansion: proposed window is identical to the current window; extend start earlier and/or end later',
      );
    }
  }

  /** Added prefix/suffix ranges relative to the original window (may be empty). */
  expansionDeltas(
    current: TimeWindow,
    proposed: TimeWindow,
  ): TimeWindow[] {
    const curStart = this.toMinutes(this.normalizeTime(current.startTime));
    const curEnd = this.toMinutes(this.normalizeTime(current.endTime));
    const newStart = this.toMinutes(this.normalizeTime(proposed.startTime));
    const newEnd = this.toMinutes(this.normalizeTime(proposed.endTime));
    const deltas: TimeWindow[] = [];

    const minutesToTime = (total: number): string => {
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    if (newStart < curStart) {
      deltas.push({
        startTime: minutesToTime(newStart),
        endTime: minutesToTime(curStart),
      });
    }
    if (newEnd > curEnd) {
      deltas.push({
        startTime: minutesToTime(curEnd),
        endTime: minutesToTime(newEnd),
      });
    }
    return deltas;
  }
}
