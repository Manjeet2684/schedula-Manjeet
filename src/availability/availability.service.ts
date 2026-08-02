import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';
import { AvailabilityValidationService } from './availability-validation.service';
import {
  CreateCustomAvailabilityDto,
  CreateRecurringAvailabilityDto,
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
}
