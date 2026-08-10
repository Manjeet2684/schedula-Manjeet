import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { AvailabilityService } from '../availability/availability.service';
import { CustomAvailability } from '../availability/entities/custom-availability.entity';
import { RecurringAvailability } from '../availability/entities/recurring-availability.entity';
import { Doctor } from '../doctor/doctor.entity';
import {
  NotificationType,
} from '../notification/notification.entity';
import { NotificationService } from '../notification/notification.service';
import { Patient } from '../patient/patient.entity';
import {
  DoctorScheduleConfig,
  SchedulingType,
} from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';
import {
  SlotUnavailableException,
  SuggestedSlotPayload,
} from './exceptions/slot-unavailable.exception';

const CUTOFF_MS = 30 * 60 * 1000;
const SUGGESTION_LOOKAHEAD_DAYS = 21;

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Slot)
    private readonly slotRepo: Repository<Slot>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(DoctorScheduleConfig)
    private readonly configRepo: Repository<DoctorScheduleConfig>,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /** Never throws — notification failures must not affect appointment outcomes. */
  private async notifyAppointmentEvent(
    type: NotificationType,
    appointment: {
      id: string;
      patientId: string;
      appointmentDate?: string;
      date?: string;
      startTime: string;
      doctor?: { fullName?: string };
    },
  ): Promise<void> {
    try {
      const doctorName = appointment.doctor?.fullName;
      if (!doctorName) {
        this.logger.warn(
          `Skipping ${type} notification for appointment ${appointment.id}: doctor name unavailable`,
        );
        return;
      }
      const date =
        appointment.appointmentDate ??
        (appointment.date ? String(appointment.date).slice(0, 10) : '');
      await this.notificationService.createAppointmentNotification({
        type,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        doctorName,
        date,
        time: this.fromDbTime(String(appointment.startTime)),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create ${type} notification for appointment ${appointment.id}: ${detail}`,
      );
    }
  }

  private normalizeTime(time: string): string {
    const parts = time.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }

  private fromDbTime(time: string): string {
    return this.normalizeTime(String(time).slice(0, 5));
  }

  private toCalendarDate(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private toDateTime(date: string, startTime: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    const start = this.normalizeTime(startTime);
    const [hh, mm] = start.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  private addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y, m - 1, d + days);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private assertNotPast(date: string, startTime: string): void {
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
    const start = this.normalizeTime(startTime);
    const [hh, mm] = start.split(':').map(Number);
    const slotStart = new Date(y, m - 1, d, hh, mm);
    if (slotStart.getTime() <= Date.now()) {
      throw new BadRequestException(
        `Cannot book a past slot: ${date} ${start} is in the past`,
      );
    }
  }

  /** Blocks cancel/reschedule when start is within 30 minutes (or already past). */
  private assertOutsideThirtyMinuteCutoff(
    date: string,
    startTime: string,
    action: 'cancel' | 'reschedule',
  ): void {
    const apptStart = this.toDateTime(
      this.toCalendarDate(date),
      this.fromDbTime(startTime),
    );
    const msUntil = apptStart.getTime() - Date.now();
    if (msUntil < CUTOFF_MS) {
      throw new BadRequestException(
        `Cannot ${action} within 30 minutes of the appointment start time`,
      );
    }
  }

  private toResponse(appointment: Appointment) {
    return {
      id: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      slotId: appointment.slotId ?? null,
      appointmentDate: appointment.date,
      startTime: this.fromDbTime(String(appointment.startTime)),
      endTime: this.fromDbTime(String(appointment.endTime)),
      status: appointment.status,
      appointmentType: appointment.appointmentType,
      tokenNumber: appointment.tokenNumber ?? null,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      doctor: appointment.doctor
        ? {
            id: appointment.doctor.id,
            fullName: appointment.doctor.fullName,
            specialization: appointment.doctor.specialization,
            consultationFee: appointment.doctor.consultationFee,
          }
        : undefined,
      patient: appointment.patient
        ? {
            id: appointment.patient.id,
            fullName: appointment.patient.fullName,
            age: appointment.patient.age,
            gender: appointment.patient.gender,
            contactDetails: appointment.patient.contactDetails,
          }
        : undefined,
      slot: appointment.slot
        ? {
            id: appointment.slot.id,
            date: appointment.slot.date,
            startTime: this.fromDbTime(String(appointment.slot.startTime)),
            endTime: this.fromDbTime(String(appointment.slot.endTime)),
            isBooked: appointment.slot.isBooked,
          }
        : null,
    };
  }

  private async requirePatient(userId: string): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException(
        'Patient profile not found. Create a patient profile before managing appointments.',
      );
    }
    return patient;
  }

  private async requireDoctorByUser(userId: string): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found. Create a doctor profile before viewing appointments.',
      );
    }
    return doctor;
  }

  private resolveWaveWindow(
    windows: Array<{ startTime: string; endTime: string; isUnavailable?: boolean }>,
  ): { startTime: string; endTime: string } | null {
    const usable = windows.filter((w) => !w.isUnavailable);
    if (!usable.length) {
      return null;
    }
    const toMinutes = (t: string) => {
      const [h, m] = this.normalizeTime(t).split(':').map(Number);
      return h * 60 + m;
    };
    const minutesToTime = (total: number) => {
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    let start = toMinutes(usable[0].startTime);
    let end = toMinutes(usable[0].endTime);
    for (const w of usable) {
      start = Math.min(start, toMinutes(w.startTime));
      end = Math.max(end, toMinutes(w.endTime));
    }
    return { startTime: minutesToTime(start), endTime: minutesToTime(end) };
  }

  private async loadWaveWindowForDoctor(
    doctor: Doctor,
    date: string,
  ): Promise<{ startTime: string; endTime: string } | null> {
    const rows = await this.availabilityService.getEffectiveForDate(
      doctor.userId,
      date,
    );
    const windows = (
      rows as Array<CustomAvailability | RecurringAvailability>
    ).map((row) => ({
      startTime: this.fromDbTime(String(row.startTime)),
      endTime: this.fromDbTime(String(row.endTime)),
      isUnavailable:
        'isUnavailable' in row ? Boolean(row.isUnavailable) : false,
    }));
    return this.resolveWaveWindow(windows);
  }

  private async releaseStreamSlot(
    manager: EntityManager,
    slotId: string | null | undefined,
  ): Promise<void> {
    if (!slotId) {
      return;
    }
    const slot = await manager
      .createQueryBuilder(Slot, 's')
      .setLock('pessimistic_write')
      .where('s.id = :id', { id: slotId })
      .getOne();
    if (slot) {
      slot.isBooked = false;
      await manager.save(slot);
    }
  }

  private async findNextStreamSuggestion(
    doctorId: string,
    afterDate: string,
    afterStartTime: string,
  ): Promise<SuggestedSlotPayload | null> {
    const afterStart = this.normalizeTime(afterStartTime);
    const now = Date.now();

    for (let offset = 0; offset <= SUGGESTION_LOOKAHEAD_DAYS; offset++) {
      const date = this.addDays(afterDate, offset);
      const slots = await this.slotRepo
        .createQueryBuilder('s')
        .where('s.doctorId = :doctorId', { doctorId })
        .andWhere('s.date = :date', { date })
        .andWhere('s.isBooked = false')
        .orderBy('s.startTime', 'ASC')
        .getMany();

      for (const slot of slots) {
        const start = this.fromDbTime(String(slot.startTime));
        const end = this.fromDbTime(String(slot.endTime));
        if (offset === 0 && start <= afterStart) {
          continue;
        }
        if (this.toDateTime(date, start).getTime() <= now) {
          continue;
        }
        return {
          slotId: slot.id,
          date,
          startTime: start,
          endTime: end,
          schedulingType: SchedulingType.STREAM,
        };
      }
    }
    return null;
  }

  private async findNextWaveSuggestion(
    doctor: Doctor,
    maxCapacity: number,
    fromDateExclusive: string,
  ): Promise<SuggestedSlotPayload | null> {
    const now = Date.now();
    for (let offset = 1; offset <= SUGGESTION_LOOKAHEAD_DAYS; offset++) {
      const date = this.addDays(fromDateExclusive, offset);
      const wave = await this.loadWaveWindowForDoctor(doctor, date);
      if (!wave) {
        continue;
      }
      if (this.toDateTime(date, wave.startTime).getTime() <= now) {
        continue;
      }
      const bookedCount = await this.appointmentRepo.count({
        where: {
          doctorId: doctor.id,
          date,
          status: AppointmentStatus.BOOKED,
          appointmentType: SchedulingType.WAVE,
        },
      });
      if (bookedCount < maxCapacity) {
        return {
          slotId: null,
          date,
          startTime: wave.startTime,
          endTime: wave.endTime,
          schedulingType: SchedulingType.WAVE,
        };
      }
    }
    return null;
  }

  /**
   * Atomic STREAM booking: lock slot row, insert appointment, mark isBooked.
   * Unique partial index on appointments.slot_id (BOOKED) is the hard DB guard.
   */
  async book(userId: string, dto: CreateAppointmentDto) {
    const patient = await this.requirePatient(userId);

    const doctor = await this.doctorRepo.findOne({
      where: { id: dto.doctorId },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const startTime = this.normalizeTime(dto.startTime);
    const endTime = this.normalizeTime(dto.endTime);
    this.assertNotPast(dto.date, startTime);

    const result = await this.dataSource.transaction(async (manager) => {
      const slot = await manager
        .createQueryBuilder(Slot, 's')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: dto.slotId })
        .getOne();

      if (!slot) {
        throw new NotFoundException('Slot not found');
      }

      const slotStart = this.fromDbTime(String(slot.startTime));
      const slotEnd = this.fromDbTime(String(slot.endTime));
      const slotDate = this.toCalendarDate(slot.date as string);

      if (
        slot.doctorId !== dto.doctorId ||
        slotDate !== dto.date ||
        slotStart !== startTime ||
        slotEnd !== endTime
      ) {
        throw new BadRequestException(
          'slotId does not match the provided doctorId/date/startTime/endTime',
        );
      }

      if (slot.isBooked) {
        throw new BadRequestException('Slot already booked');
      }

      slot.isBooked = true;
      await manager.save(slot);

      const appointment = manager.create(Appointment, {
        doctorId: doctor.id,
        patientId: patient.id,
        slotId: slot.id,
        appointmentType: SchedulingType.STREAM,
        date: dto.date,
        startTime,
        endTime,
        tokenNumber: null,
        status: AppointmentStatus.BOOKED,
      });

      const saved = await manager.save(appointment);
      return this.toResponse(
        await manager.findOneOrFail(Appointment, {
          where: { id: saved.id },
          relations: ['doctor', 'patient', 'slot'],
        }),
      );
    });

    await this.notifyAppointmentEvent(
      NotificationType.APPOINTMENT_BOOKED,
      result,
    );
    return result;
  }

  async listMine(userId: string) {
    const patient = await this.requirePatient(userId);
    const rows = await this.appointmentRepo.find({
      where: { patientId: patient.id },
      relations: ['doctor', 'slot'],
      order: { date: 'ASC', startTime: 'ASC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listForDoctor(userId: string) {
    const doctor = await this.requireDoctorByUser(userId);
    const rows = await this.appointmentRepo.find({
      where: { doctorId: doctor.id },
      relations: ['patient', 'slot'],
      order: { date: 'ASC', startTime: 'ASC' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async cancel(userId: string, appointmentId: string) {
    const patient = await this.requirePatient(userId);

    const result = await this.dataSource.transaction(async (manager) => {
      // Lock appointment only — Postgres forbids FOR UPDATE with nullable outer joins.
      const appointment = await manager
        .createQueryBuilder(Appointment, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: appointmentId })
        .getOne();

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      if (appointment.patientId !== patient.id) {
        throw new ForbiddenException(
          'You can only cancel your own appointments',
        );
      }

      if (appointment.status === AppointmentStatus.CANCELLED) {
        throw new BadRequestException('Appointment is already cancelled');
      }

      const apptDate = this.toCalendarDate(appointment.date as string);
      const apptStart = this.fromDbTime(String(appointment.startTime));

      this.assertOutsideThirtyMinuteCutoff(apptDate, apptStart, 'cancel');

      appointment.status = AppointmentStatus.CANCELLED;
      await manager.save(appointment);

      if (appointment.slotId) {
        await this.releaseStreamSlot(manager, appointment.slotId);
      }

      return this.toResponse(
        await manager.findOneOrFail(Appointment, {
          where: { id: appointment.id },
          relations: ['doctor', 'patient', 'slot'],
        }),
      );
    });

    await this.notifyAppointmentEvent(
      NotificationType.APPOINTMENT_CANCELLED,
      result,
    );
    return result;
  }

  async reschedule(
    userId: string,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
  ) {
    if (
      dto.schedulingType !== SchedulingType.STREAM &&
      dto.schedulingType !== SchedulingType.WAVE
    ) {
      throw new BadRequestException(
        `Invalid scheduling type "${String(dto.schedulingType)}": must be STREAM or WAVE`,
      );
    }

    const patient = await this.requirePatient(userId);

    const result = await this.dataSource.transaction(async (manager) => {
      const appointment = await manager
        .createQueryBuilder(Appointment, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: appointmentId })
        .getOne();

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      if (appointment.patientId !== patient.id) {
        throw new ForbiddenException(
          'You can only reschedule your own appointments',
        );
      }

      if (appointment.status === AppointmentStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot reschedule a cancelled appointment',
        );
      }

      const currentDate = this.toCalendarDate(appointment.date as string);
      const currentStart = this.fromDbTime(String(appointment.startTime));
      this.assertOutsideThirtyMinuteCutoff(
        currentDate,
        currentStart,
        'reschedule',
      );

      const doctor = await manager.findOne(Doctor, {
        where: { id: appointment.doctorId },
      });
      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }

      if (dto.schedulingType === SchedulingType.STREAM) {
        return this.rescheduleToStream(
          manager,
          appointment,
          doctor,
          dto,
          currentDate,
          currentStart,
        );
      }

      return this.rescheduleToWave(
        manager,
        appointment,
        doctor,
        dto,
        currentDate,
      );
    });

    await this.notifyAppointmentEvent(
      NotificationType.APPOINTMENT_RESCHEDULED,
      result,
    );
    return result;
  }

  private async rescheduleToStream(
    manager: EntityManager,
    appointment: Appointment,
    doctor: Doctor,
    dto: RescheduleAppointmentDto,
    currentDate: string,
    currentStart: string,
  ) {
    if (!dto.slotId || !dto.startTime || !dto.endTime) {
      throw new BadRequestException(
        'slotId, startTime, and endTime are required for STREAM reschedule',
      );
    }

    const startTime = this.normalizeTime(dto.startTime);
    const endTime = this.normalizeTime(dto.endTime);
    this.assertNotPast(dto.date, startTime);

    const sameSlot =
      (appointment.slotId && appointment.slotId === dto.slotId) ||
      (appointment.appointmentType === SchedulingType.STREAM &&
        currentDate === dto.date &&
        currentStart === startTime &&
        this.fromDbTime(String(appointment.endTime)) === endTime);

    if (sameSlot) {
      throw new BadRequestException(
        'Cannot reschedule to the same slot/time already booked',
      );
    }

    const target = await manager
      .createQueryBuilder(Slot, 's')
      .setLock('pessimistic_write')
      .where('s.id = :id', { id: dto.slotId })
      .getOne();

    if (!target) {
      throw new NotFoundException('Slot not found');
    }

    const slotDate = this.toCalendarDate(target.date as string);
    const slotStart = this.fromDbTime(String(target.startTime));
    const slotEnd = this.fromDbTime(String(target.endTime));

    if (target.doctorId !== doctor.id) {
      throw new BadRequestException(
        'Target slot must belong to the same doctor',
      );
    }

    if (
      slotDate !== dto.date ||
      slotStart !== startTime ||
      slotEnd !== endTime
    ) {
      throw new BadRequestException(
        'slotId does not match the provided date/startTime/endTime',
      );
    }

    if (target.isBooked) {
      const suggested = await this.findNextStreamSuggestion(
        doctor.id,
        dto.date,
        startTime,
      );
      throw new SlotUnavailableException(suggested);
    }

    const oldSlotId = appointment.slotId;
    // Avoid unique conflicts if DB has a partial unique index: release then reserve.
    if (oldSlotId && oldSlotId !== target.id) {
      await this.releaseStreamSlot(manager, oldSlotId);
    }

    target.isBooked = true;
    await manager.save(target);

    appointment.slotId = target.id;
    appointment.appointmentType = SchedulingType.STREAM;
    appointment.date = dto.date;
    appointment.startTime = startTime;
    appointment.endTime = endTime;
    appointment.tokenNumber = null;
    await manager.save(appointment);

    return this.toResponse(
      await manager.findOneOrFail(Appointment, {
        where: { id: appointment.id },
        relations: ['doctor', 'patient', 'slot'],
      }),
    );
  }

  private async rescheduleToWave(
    manager: EntityManager,
    appointment: Appointment,
    doctor: Doctor,
    dto: RescheduleAppointmentDto,
    currentDate: string,
  ) {
    if (
      appointment.appointmentType === SchedulingType.WAVE &&
      currentDate === dto.date
    ) {
      throw new BadRequestException(
        'Cannot reschedule to the same slot/time already booked',
      );
    }

    const config = await manager
      .createQueryBuilder(DoctorScheduleConfig, 'c')
      .setLock('pessimistic_write')
      .where('c.doctorId = :doctorId', { doctorId: doctor.id })
      .getOne();

    if (!config) {
      throw new NotFoundException(
        `Doctor ${doctor.id} has no schedule configuration`,
      );
    }

    const maxCapacity = config.maxCapacity ?? 0;
    if (maxCapacity <= 0) {
      throw new BadRequestException(
        'Invalid maxCapacity: must be greater than 0 for WAVE scheduling',
      );
    }

    const wave = await this.loadWaveWindowForDoctor(doctor, dto.date);
    if (!wave) {
      throw new NotFoundException(
        `Wave window not found for doctor on ${dto.date}`,
      );
    }

    this.assertNotPast(dto.date, wave.startTime);

    const dayAppointments = await manager
      .createQueryBuilder(Appointment, 'a')
      .setLock('pessimistic_write')
      .where('a.doctorId = :doctorId', { doctorId: doctor.id })
      .andWhere('a.date = :date', { date: dto.date })
      .andWhere('a.appointmentType = :type', { type: SchedulingType.WAVE })
      .orderBy('a.tokenNumber', 'ASC')
      .getMany();

    const booked = dayAppointments.filter(
      (a) =>
        a.status === AppointmentStatus.BOOKED && a.id !== appointment.id,
    );

    if (booked.length >= maxCapacity) {
      const suggested = await this.findNextWaveSuggestion(
        doctor,
        maxCapacity,
        dto.date,
      );
      throw new SlotUnavailableException(suggested);
    }

    const oldSlotId = appointment.slotId;
    await this.releaseStreamSlot(manager, oldSlotId);

    const maxToken = dayAppointments.reduce(
      (max, a) => Math.max(max, a.tokenNumber ?? 0),
      0,
    );
    const nextToken = maxToken + 1;

    appointment.slotId = null;
    appointment.appointmentType = SchedulingType.WAVE;
    appointment.date = dto.date;
    appointment.startTime = wave.startTime;
    appointment.endTime = wave.endTime;
    appointment.tokenNumber = nextToken;
    await manager.save(appointment);

    return this.toResponse(
      await manager.findOneOrFail(Appointment, {
        where: { id: appointment.id },
        relations: ['doctor', 'patient', 'slot'],
      }),
    );
  }
}
