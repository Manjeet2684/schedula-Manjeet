import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';
import {
  DoctorScheduleConfig,
  SchedulingType,
} from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import { AvailabilityValidationService } from './availability-validation.service';
import {
  CreateCustomAvailabilityDto,
  CreateRecurringAvailabilityDto,
  ExpandAvailabilityDto,
  UpdateRecurringAvailabilityDto,
} from './dto/availability.dto';
import { CustomAvailability } from './entities/custom-availability.entity';
import {
  DayOfWeek,
  RecurringAvailability,
} from './entities/recurring-availability.entity';

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

type AvailabilityTarget =
  | { kind: 'recurring'; row: RecurringAvailability }
  | { kind: 'custom'; row: CustomAvailability };

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(RecurringAvailability)
    private readonly recurringRepo: Repository<RecurringAvailability>,
    @InjectRepository(CustomAvailability)
    private readonly customRepo: Repository<CustomAvailability>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    private readonly validation: AvailabilityValidationService,
    private readonly dataSource: DataSource,
  ) {}

  private async requireDoctor(userId: string): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found. Create a doctor profile before managing availability.',
      );
    }
    return doctor;
  }

  private async requireOwnedRecurring(
    userId: string,
    slotId: string,
  ): Promise<{ doctor: Doctor; slot: RecurringAvailability }> {
    const doctor = await this.requireDoctor(userId);
    const slot = await this.recurringRepo.findOne({ where: { id: slotId } });
    if (!slot) {
      throw new NotFoundException(
        `Recurring availability slot ${slotId} not found`,
      );
    }
    if (slot.doctorId !== doctor.id) {
      throw new ForbiddenException(
        "You cannot modify another doctor's availability slot",
      );
    }
    return { doctor, slot };
  }

  /** Parse YYYY-MM-DD as a local calendar date; reject non-existent dates. */
  private parseCalendarDate(date: string): Date {
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

  private fromDbTime(time: string): string {
    return this.validation.normalizeTime(String(time).slice(0, 5));
  }

  /** Same STREAM algorithm as SchedulingService.generateStreamSlots (duration + buffer). */
  private generateSlotsInWindow(
    startTime: string,
    endTime: string,
    slotDuration: number,
    bufferTime: number,
  ): Array<{ startTime: string; endTime: string }> {
    const slots: Array<{ startTime: string; endTime: string }> = [];
    let cursor = this.validation.toMinutes(startTime);
    const windowEnd = this.validation.toMinutes(endTime);

    while (cursor + slotDuration <= windowEnd) {
      const endTotal = cursor + slotDuration;
      slots.push({
        startTime: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
        endTime: `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`,
      });
      cursor += slotDuration + bufferTime;
    }
    return slots;
  }

  async createRecurring(
    userId: string,
    dto: CreateRecurringAvailabilityDto,
  ): Promise<RecurringAvailability[]> {
    const doctor = await this.requireDoctor(userId);
    const created: RecurringAvailability[] = [];
    const pendingByDay = new Map<DayOfWeek, RecurringAvailability[]>();

    for (const item of dto.slots) {
      const existing = await this.recurringRepo.find({
        where: { doctorId: doctor.id, dayOfWeek: item.dayOfWeek },
      });
      const sameBatch = pendingByDay.get(item.dayOfWeek) ?? [];
      const peers = [...existing, ...sameBatch];

      this.validation.validateWindowAgainstExisting(
        item,
        peers,
        `${item.dayOfWeek}`,
      );

      const entity = this.recurringRepo.create({
        doctorId: doctor.id,
        dayOfWeek: item.dayOfWeek,
        startTime: this.validation.normalizeTime(item.startTime),
        endTime: this.validation.normalizeTime(item.endTime),
        slotDuration: item.slotDuration ?? null,
      });
      sameBatch.push(entity);
      pendingByDay.set(item.dayOfWeek, sameBatch);
      created.push(entity);
    }

    return this.recurringRepo.save(created);
  }

  async listRecurring(userId: string): Promise<RecurringAvailability[]> {
    const doctor = await this.requireDoctor(userId);
    return this.recurringRepo.find({
      where: { doctorId: doctor.id },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async updateRecurring(
    userId: string,
    slotId: string,
    dto: UpdateRecurringAvailabilityDto,
  ): Promise<RecurringAvailability> {
    const { doctor, slot } = await this.requireOwnedRecurring(userId, slotId);

    const nextDay = dto.dayOfWeek ?? slot.dayOfWeek;
    const nextStart = this.validation.normalizeTime(
      dto.startTime ?? slot.startTime,
    );
    const nextEnd = this.validation.normalizeTime(dto.endTime ?? slot.endTime);

    const peers = await this.recurringRepo.find({
      where: {
        doctorId: doctor.id,
        dayOfWeek: nextDay,
        id: Not(slot.id),
      },
    });

    this.validation.validateWindowAgainstExisting(
      { startTime: nextStart, endTime: nextEnd },
      peers,
      `${nextDay}`,
    );

    slot.dayOfWeek = nextDay;
    slot.startTime = nextStart;
    slot.endTime = nextEnd;
    if (dto.slotDuration !== undefined) {
      slot.slotDuration = dto.slotDuration;
    }

    return this.recurringRepo.save(slot);
  }

  async deleteRecurring(
    userId: string,
    slotId: string,
  ): Promise<{ message: string }> {
    await this.requireOwnedRecurring(userId, slotId);
    await this.recurringRepo.delete(slotId);
    return { message: `Recurring availability slot ${slotId} deleted` };
  }

  /**
   * Create/replace custom override for one calendar date.
   * isUnavailable=true → full-day block (times stored but ignored for booking).
   */
  async upsertOverride(
    userId: string,
    dto: CreateCustomAvailabilityDto,
  ): Promise<CustomAvailability> {
    const doctor = await this.requireDoctor(userId);
    this.validation.assertValidOverrideDate(dto.date);

    const isUnavailable = dto.isUnavailable === true;
    const startTime = this.validation.normalizeTime(dto.startTime);
    const endTime = this.validation.normalizeTime(dto.endTime);

    if (!isUnavailable) {
      this.validation.validateWindowAgainstExisting(
        { startTime, endTime },
        [],
        `date ${dto.date}`,
      );
    }

    const existing = await this.customRepo.find({
      where: { doctorId: doctor.id, date: dto.date },
    });
    if (existing.length) {
      await this.customRepo.remove(existing);
    }

    const row = this.customRepo.create({
      doctorId: doctor.id,
      date: dto.date,
      startTime,
      endTime,
      isUnavailable,
    });

    return this.customRepo.save(row);
  }

  /**
   * Effective availability for a date:
   * 1) custom override rows if any (including isUnavailable)
   * 2) else recurring windows for that weekday
   * 3) else [] with 200
   * Past dates are allowed on GET (history); only format/calendar validity is checked.
   */
  async getEffectiveForDate(
    userId: string,
    date: string,
  ): Promise<CustomAvailability[] | RecurringAvailability[]> {
    const doctor = await this.requireDoctor(userId);
    const parsed = this.parseCalendarDate(date);

    const overrides = await this.customRepo.find({
      where: { doctorId: doctor.id, date },
      order: { startTime: 'ASC' },
    });
    if (overrides.length > 0) {
      return overrides;
    }

    const dayOfWeek = JS_DAY_TO_ENUM[parsed.getDay()];
    return this.recurringRepo.find({
      where: { doctorId: doctor.id, dayOfWeek },
      order: { startTime: 'ASC' },
    });
  }

  private async resolveOwnedAvailability(
    manager: EntityManager,
    doctor: Doctor,
    id: string,
  ): Promise<AvailabilityTarget> {
    const recurring = await manager.findOne(RecurringAvailability, {
      where: { id },
    });
    if (recurring) {
      if (recurring.doctorId !== doctor.id) {
        throw new ForbiddenException(
          "You cannot modify another doctor's availability slot",
        );
      }
      return { kind: 'recurring', row: recurring };
    }

    const custom = await manager.findOne(CustomAvailability, {
      where: { id },
    });
    if (custom) {
      if (custom.doctorId !== doctor.id) {
        throw new ForbiddenException(
          "You cannot modify another doctor's availability slot",
        );
      }
      return { kind: 'custom', row: custom };
    }

    throw new NotFoundException(`Availability slot ${id} not found`);
  }

  /**
   * Expand availability window (strict superset) and materialize STREAM deltas
   * or scale WAVE capacity inside one transaction.
   */
  async expand(userId: string, id: string, dto: ExpandAvailabilityDto) {
    const doctor = await this.requireDoctor(userId);
    this.parseCalendarDate(dto.date);
    this.validation.assertValidOverrideDate(dto.date);

    const newStart = this.validation.normalizeTime(dto.startTime);
    const newEnd = this.validation.normalizeTime(dto.endTime);

    return this.dataSource.transaction(async (manager) => {
      const target = await this.resolveOwnedAvailability(manager, doctor, id);
      const currentStart = this.fromDbTime(String(target.row.startTime));
      const currentEnd = this.fromDbTime(String(target.row.endTime));

      this.validation.assertStrictSupersetExpansion(
        { startTime: currentStart, endTime: currentEnd },
        { startTime: newStart, endTime: newEnd },
      );

      if (target.kind === 'custom' && target.row.isUnavailable) {
        throw new BadRequestException(
          'Cannot expand an unavailable (blocked) override; clear the block first',
        );
      }

      if (target.kind === 'custom') {
        const customDate =
          typeof target.row.date === 'string'
            ? target.row.date.slice(0, 10)
            : String(target.row.date).slice(0, 10);
        if (customDate !== dto.date) {
          throw new BadRequestException(
            `Expand date ${dto.date} does not match override date ${customDate}`,
          );
        }
      } else {
        const weekday =
          JS_DAY_TO_ENUM[this.parseCalendarDate(dto.date).getDay()];
        if (target.row.dayOfWeek !== weekday) {
          throw new BadRequestException(
            `Expand date ${dto.date} is ${weekday}, but recurring availability is for ${target.row.dayOfWeek}`,
          );
        }
      }

      let peers: Array<{ startTime: string; endTime: string }> = [];
      if (target.kind === 'recurring') {
        const rows = await manager.find(RecurringAvailability, {
          where: {
            doctorId: doctor.id,
            dayOfWeek: target.row.dayOfWeek,
            id: Not(target.row.id),
          },
        });
        peers = rows.map((r) => ({
          startTime: this.fromDbTime(String(r.startTime)),
          endTime: this.fromDbTime(String(r.endTime)),
        }));
      } else {
        const rows = await manager.find(CustomAvailability, {
          where: {
            doctorId: doctor.id,
            date: dto.date,
            id: Not(target.row.id),
          },
        });
        peers = rows
          .filter((r) => !r.isUnavailable)
          .map((r) => ({
            startTime: this.fromDbTime(String(r.startTime)),
            endTime: this.fromDbTime(String(r.endTime)),
          }));
      }

      this.validation.validateWindowAgainstExisting(
        { startTime: newStart, endTime: newEnd },
        peers,
        target.kind === 'recurring'
          ? `${target.row.dayOfWeek}`
          : `date ${dto.date}`,
      );

      target.row.startTime = newStart;
      target.row.endTime = newEnd;
      if (target.kind === 'recurring' && dto.slotDuration !== undefined) {
        target.row.slotDuration = dto.slotDuration;
      }
      await manager.save(target.row);

      const config = await manager.findOne(DoctorScheduleConfig, {
        where: { doctorId: doctor.id },
      });
      if (!config) {
        throw new NotFoundException(
          'No schedule configuration found for this doctor. Set one via POST /doctor/schedule-config.',
        );
      }

      const deltas = this.validation.expansionDeltas(
        { startTime: currentStart, endTime: currentEnd },
        { startTime: newStart, endTime: newEnd },
      );

      const createdSlots: Slot[] = [];
      let maxCapacity: number | null = config.maxCapacity ?? null;

      if (config.schedulingType === SchedulingType.STREAM) {
        const slotDuration =
          dto.slotDuration ??
          (target.kind === 'recurring'
            ? (target.row.slotDuration ?? undefined)
            : undefined) ??
          config.slotDuration ??
          undefined;
        if (!slotDuration || slotDuration <= 0) {
          throw new BadRequestException(
            'slotDuration is required for STREAM expansion (provide in body or schedule config)',
          );
        }
        const bufferTime = config.bufferTime ?? 0;

        for (const delta of deltas) {
          const generated = this.generateSlotsInWindow(
            delta.startTime,
            delta.endTime,
            slotDuration,
            bufferTime,
          );
          for (const g of generated) {
            let slot = await manager.findOne(Slot, {
              where: {
                doctorId: doctor.id,
                date: dto.date,
                startTime: g.startTime,
                endTime: g.endTime,
              },
            });
            if (!slot) {
              slot = manager.create(Slot, {
                doctorId: doctor.id,
                date: dto.date,
                startTime: g.startTime,
                endTime: g.endTime,
                isBooked: false,
              });
              slot = await manager.save(slot);
              createdSlots.push(slot);
            }
          }
        }
      } else {
        const oldCap = config.maxCapacity ?? 0;
        if (oldCap <= 0 && dto.capacity === undefined) {
          throw new BadRequestException(
            'WAVE maxCapacity is not set; provide capacity in the expand payload',
          );
        }
        const oldDuration =
          this.validation.toMinutes(currentEnd) -
          this.validation.toMinutes(currentStart);
        const newDuration =
          this.validation.toMinutes(newEnd) -
          this.validation.toMinutes(newStart);

        if (dto.capacity !== undefined) {
          maxCapacity = dto.capacity;
        } else {
          maxCapacity = Math.ceil(oldCap * (newDuration / oldDuration));
        }
        if (maxCapacity < oldCap) {
          throw new BadRequestException(
            `WAVE capacity cannot shrink on expansion (current ${oldCap}, proposed ${maxCapacity})`,
          );
        }
        config.maxCapacity = maxCapacity;
        await manager.save(config);
      }

      return {
        availability: {
          id: target.row.id,
          kind: target.kind,
          doctorId: doctor.id,
          date: dto.date,
          startTime: newStart,
          endTime: newEnd,
          ...(target.kind === 'recurring'
            ? {
                dayOfWeek: target.row.dayOfWeek,
                slotDuration: target.row.slotDuration ?? null,
              }
            : { isUnavailable: target.row.isUnavailable }),
        },
        schedulingType: config.schedulingType,
        maxCapacity,
        createdSlots: createdSlots.map((s) => ({
          id: s.id,
          date: s.date,
          startTime: this.fromDbTime(String(s.startTime)),
          endTime: this.fromDbTime(String(s.endTime)),
          isBooked: s.isBooked,
        })),
      };
    });
  }
}
