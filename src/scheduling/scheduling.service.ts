import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { AvailabilityService } from '../availability/availability.service';
import { CustomAvailability } from '../availability/entities/custom-availability.entity';
import { RecurringAvailability } from '../availability/entities/recurring-availability.entity';
import { Doctor } from '../doctor/doctor.entity';
import { NotificationType } from '../notification/notification.entity';
import { NotificationService } from '../notification/notification.service';
import { Patient } from '../patient/patient.entity';
import { Slot } from '../slots/slot.entity';
import {
  BookAppointmentDto,
  UpsertScheduleConfigDto,
} from './dto/scheduling.dto';
import {
  DoctorScheduleConfig,
  SchedulingType,
} from './entities/doctor-schedule-config.entity';
import { SchedulingValidationService } from './scheduling-validation.service';

type AvailabilityWindow = {
  startTime: string;
  endTime: string;
  isUnavailable?: boolean;
};

export type StreamSlotView = {
  id: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
};

export type WaveSlotView = {
  startTime: string;
  endTime: string;
  maxCapacity: number;
  bookedCount: number;
  availableCapacity: number;
};

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(DoctorScheduleConfig)
    private readonly configRepo: Repository<DoctorScheduleConfig>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Slot)
    private readonly slotRepo: Repository<Slot>,
    private readonly availabilityService: AvailabilityService,
    private readonly validation: SchedulingValidationService,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  /** Never throws — notification failures must not affect booking outcomes. */
  private async notifyBooked(
    appointment: Appointment,
    doctor: Doctor,
  ): Promise<void> {
    try {
      const date =
        typeof appointment.date === 'string'
          ? appointment.date.slice(0, 10)
          : String(appointment.date).slice(0, 10);
      await this.notificationService.createAppointmentNotification({
        type: NotificationType.APPOINTMENT_BOOKED,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        doctorName: doctor.fullName,
        date,
        time: this.validation.fromDbTime(String(appointment.startTime)),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create APPOINTMENT_BOOKED notification for appointment ${appointment.id}: ${detail}`,
      );
    }
  }

  /**
   * Upsert persisted Slot rows for generated STREAM windows.
   * Preserves isBooked so Day 6 cancel/book stay consistent after redeploy.
   */
  private async materializeStreamSlots(
    doctorId: string,
    date: string,
    generated: Array<{ startTime: string; endTime: string }>,
  ): Promise<StreamSlotView[]> {
    const views: StreamSlotView[] = [];

    for (const g of generated) {
      let slot = await this.slotRepo.findOne({
        where: {
          doctorId,
          date,
          startTime: g.startTime,
          endTime: g.endTime,
        },
      });

      if (!slot) {
        slot = await this.slotRepo.save(
          this.slotRepo.create({
            doctorId,
            date,
            startTime: g.startTime,
            endTime: g.endTime,
            isBooked: false,
          }),
        );
      }

      views.push({
        id: slot.id,
        startTime: this.validation.fromDbTime(String(slot.startTime)),
        endTime: this.validation.fromDbTime(String(slot.endTime)),
        isBooked: slot.isBooked,
      });
    }

    return views;
  }

  private async requireDoctorByUserId(userId: string): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found. Create a doctor profile before managing schedule config.',
      );
    }
    return doctor;
  }

  private async requireDoctorById(doctorId: string): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) {
      throw new NotFoundException(`Doctor not found for id ${doctorId}`);
    }
    return doctor;
  }

  private async requirePatientByUserId(userId: string): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException(
        'Patient profile not found. Create a patient profile before booking.',
      );
    }
    return patient;
  }

  private async loadEffectiveWindows(
    doctor: Doctor,
    date: string,
  ): Promise<AvailabilityWindow[]> {
    this.validation.assertValidCalendarDate(date);
    const rows = await this.availabilityService.getEffectiveForDate(
      doctor.userId,
      date,
    );

    return (rows as Array<CustomAvailability | RecurringAvailability>).map(
      (row) => ({
        startTime: this.validation.fromDbTime(String(row.startTime)),
        endTime: this.validation.fromDbTime(String(row.endTime)),
        isUnavailable:
          'isUnavailable' in row ? Boolean(row.isUnavailable) : false,
      }),
    );
  }

  private generateStreamSlots(
    windows: AvailabilityWindow[],
    slotDuration: number,
    bufferTime: number,
  ): Array<{ startTime: string; endTime: string }> {
    const slots: Array<{ startTime: string; endTime: string }> = [];

    for (const window of windows) {
      if (window.isUnavailable) {
        continue;
      }
      this.validation.assertValidTimeRange(window.startTime, window.endTime);

      let cursor = this.validation.toMinutes(window.startTime);
      const windowEnd = this.validation.toMinutes(window.endTime);

      while (cursor + slotDuration <= windowEnd) {
        const startTime = this.validation.minutesToTime(cursor);
        const endTime = this.validation.minutesToTime(cursor + slotDuration);
        slots.push({ startTime, endTime });
        cursor += slotDuration + bufferTime;
      }
    }

    return slots;
  }

  private resolveWaveWindow(
    windows: AvailabilityWindow[],
  ): { startTime: string; endTime: string } | null {
    const usable = windows.filter((w) => !w.isUnavailable);
    if (!usable.length) {
      return null;
    }

    let start = this.validation.toMinutes(usable[0].startTime);
    let end = this.validation.toMinutes(usable[0].endTime);
    for (const w of usable) {
      start = Math.min(start, this.validation.toMinutes(w.startTime));
      end = Math.max(end, this.validation.toMinutes(w.endTime));
    }

    return {
      startTime: this.validation.minutesToTime(start),
      endTime: this.validation.minutesToTime(end),
    };
  }

  async upsertScheduleConfig(
    userId: string,
    dto: UpsertScheduleConfigDto,
  ): Promise<DoctorScheduleConfig> {
    this.validation.assertValidSchedulingType(dto.schedulingType);
    const doctor = await this.requireDoctorByUserId(userId);

    if (dto.schedulingType === SchedulingType.STREAM) {
      this.validation.assertStreamConfig(dto.slotDuration, dto.bufferTime);
    } else {
      this.validation.assertWaveConfig(dto.maxCapacity);
    }

    let config = await this.configRepo.findOne({
      where: { doctorId: doctor.id },
    });

    if (!config) {
      config = this.configRepo.create({ doctorId: doctor.id });
    }

    config.schedulingType = dto.schedulingType;
    if (dto.schedulingType === SchedulingType.STREAM) {
      config.slotDuration = dto.slotDuration!;
      config.bufferTime = dto.bufferTime ?? 0;
      config.maxCapacity = null;
    } else {
      config.maxCapacity = dto.maxCapacity!;
      config.slotDuration = null;
      config.bufferTime = null;
    }

    return this.configRepo.save(config);
  }

  async getScheduleConfig(userId: string): Promise<DoctorScheduleConfig> {
    const doctor = await this.requireDoctorByUserId(userId);
    const config = await this.configRepo.findOne({
      where: { doctorId: doctor.id },
    });
    if (!config) {
      throw new NotFoundException(
        'No schedule configuration found for this doctor. Set one via POST /doctor/schedule-config.',
      );
    }
    return config;
  }

  async getSlots(
    doctorId: string,
    date: string,
  ): Promise<StreamSlotView[] | WaveSlotView | []> {
    const doctor = await this.requireDoctorById(doctorId);
    const config = await this.configRepo.findOne({
      where: { doctorId: doctor.id },
    });
    if (!config) {
      throw new NotFoundException(
        `Doctor ${doctorId} has no schedule configuration`,
      );
    }

    const windows = await this.loadEffectiveWindows(doctor, date);
    if (
      !windows.length ||
      windows.every((w) => w.isUnavailable)
    ) {
      return [];
    }

    if (config.schedulingType === SchedulingType.STREAM) {
      const slotDuration = config.slotDuration ?? 0;
      const bufferTime = config.bufferTime ?? 0;
      this.validation.assertStreamConfig(slotDuration, bufferTime);

      const generated = this.generateStreamSlots(
        windows,
        slotDuration,
        bufferTime,
      );

      return this.materializeStreamSlots(doctor.id, date, generated);
    }

    const maxCapacity = config.maxCapacity ?? 0;
    this.validation.assertWaveConfig(maxCapacity);
    const wave = this.resolveWaveWindow(windows);
    if (!wave) {
      return [];
    }

    const bookedCount = await this.appointmentRepo.count({
      where: {
        doctorId: doctor.id,
        date,
        status: AppointmentStatus.BOOKED,
        appointmentType: SchedulingType.WAVE,
      },
    });

    return {
      startTime: wave.startTime,
      endTime: wave.endTime,
      maxCapacity,
      bookedCount,
      availableCapacity: Math.max(0, maxCapacity - bookedCount),
    };
  }

  async bookAppointment(
    userId: string,
    dto: BookAppointmentDto,
  ): Promise<Appointment> {
    const patient = await this.requirePatientByUserId(userId);
    const doctor = await this.requireDoctorById(dto.doctorId);
    this.validation.assertValidCalendarDate(dto.date);

    const config = await this.configRepo.findOne({
      where: { doctorId: doctor.id },
    });
    if (!config) {
      throw new NotFoundException(
        `Doctor ${dto.doctorId} has no schedule configuration`,
      );
    }

    if (config.schedulingType === SchedulingType.STREAM) {
      return this.bookStream(patient, doctor, config, dto);
    }
    return this.bookWave(patient, doctor, config, dto);
  }

  private async bookStream(
    patient: Patient,
    doctor: Doctor,
    config: DoctorScheduleConfig,
    dto: BookAppointmentDto,
  ): Promise<Appointment> {
    if (!dto.startTime || !dto.endTime) {
      throw new BadRequestException(
        'startTime and endTime are required when booking a STREAM slot',
      );
    }

    const startTime = this.validation.normalizeTime(dto.startTime);
    const endTime = this.validation.normalizeTime(dto.endTime);
    this.validation.assertValidTimeRange(startTime, endTime);
    this.validation.assertNotPastSlot(dto.date, startTime);

    const slotDuration = config.slotDuration ?? 0;
    const bufferTime = config.bufferTime ?? 0;
    this.validation.assertStreamConfig(slotDuration, bufferTime);

    const windows = await this.loadEffectiveWindows(doctor, dto.date);
    if (!windows.length || windows.every((w) => w.isUnavailable)) {
      throw new BadRequestException(
        `No availability windows for doctor on ${dto.date}`,
      );
    }

    const validSlots = this.generateStreamSlots(
      windows,
      slotDuration,
      bufferTime,
    );
    const matches = validSlots.some(
      (s) => s.startTime === startTime && s.endTime === endTime,
    );
    if (!matches) {
      throw new BadRequestException(
        `Slot ${startTime}–${endTime} is not a valid STREAM slot for ${dto.date}`,
      );
    }

    const duplicate = await this.appointmentRepo.findOne({
      where: {
        patientId: patient.id,
        doctorId: doctor.id,
        date: dto.date,
        startTime,
        endTime,
        status: AppointmentStatus.BOOKED,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `Duplicate booking: you already have a BOOKED appointment with this doctor on ${dto.date} at ${startTime}–${endTime}`,
      );
    }

    const existing = await this.appointmentRepo.findOne({
      where: {
        doctorId: doctor.id,
        date: dto.date,
        startTime,
        endTime,
        status: AppointmentStatus.BOOKED,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Slot ${startTime}–${endTime} on ${dto.date} is already booked`,
      );
    }

    // Reject if this booking would overlap another BOOKED STREAM appointment
    const dayBookings = await this.appointmentRepo.find({
      where: {
        doctorId: doctor.id,
        date: dto.date,
        status: AppointmentStatus.BOOKED,
        appointmentType: SchedulingType.STREAM,
      },
    });
    for (const b of dayBookings) {
      const bStart = this.validation.fromDbTime(String(b.startTime));
      const bEnd = this.validation.fromDbTime(String(b.endTime));
      if (this.validation.timesOverlap(startTime, endTime, bStart, bEnd)) {
        throw new BadRequestException(
          `Overlapping slots: ${startTime}–${endTime} overlaps existing booking ${bStart}–${bEnd}`,
        );
      }
    }

    // Keep Day 5 book path in sync with persisted Slot rows (Day 6).
    const [persisted] = await this.materializeStreamSlots(doctor.id, dto.date, [
      { startTime, endTime },
    ]);
    if (persisted.isBooked) {
      throw new ConflictException(
        `Slot ${startTime}–${endTime} on ${dto.date} is already booked`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const slot = await manager
        .createQueryBuilder(Slot, 's')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: persisted.id })
        .getOne();
      if (!slot || slot.isBooked) {
        throw new ConflictException(
          `Slot ${startTime}–${endTime} on ${dto.date} is already booked`,
        );
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
      return manager.save(appointment);
    });
  }

  /**
   * WAVE booking with pessimistic locking so concurrent requests cannot
   * assign the same token or exceed maxCapacity.
   */
  private async bookWave(
    patient: Patient,
    doctor: Doctor,
    config: DoctorScheduleConfig,
    dto: BookAppointmentDto,
  ): Promise<Appointment> {
    const maxCapacity = config.maxCapacity ?? 0;
    this.validation.assertWaveConfig(maxCapacity);

    const windows = await this.loadEffectiveWindows(doctor, dto.date);
    const wave = this.resolveWaveWindow(windows);
    if (!wave) {
      throw new BadRequestException(
        `No availability window for WAVE booking on ${dto.date}`,
      );
    }

    this.validation.assertNotPastSlot(dto.date, wave.startTime);

    const saved = await this.dataSource.transaction(async (manager) => {
      // Serialize concurrent WAVE bookings for this doctor via config-row lock.
      const lockedConfig = await manager
        .createQueryBuilder(DoctorScheduleConfig, 'c')
        .setLock('pessimistic_write')
        .where('c.doctorId = :doctorId', { doctorId: doctor.id })
        .getOne();
      if (!lockedConfig) {
        throw new NotFoundException(
          `Doctor ${doctor.id} has no schedule configuration`,
        );
      }

      const dayAppointments = await manager
        .createQueryBuilder(Appointment, 'a')
        .setLock('pessimistic_write')
        .where('a.doctorId = :doctorId', { doctorId: doctor.id })
        .andWhere('a.date = :date', { date: dto.date })
        .andWhere('a.appointmentType = :type', { type: SchedulingType.WAVE })
        .orderBy('a.tokenNumber', 'ASC')
        .getMany();

      const booked = dayAppointments.filter(
        (a) => a.status === AppointmentStatus.BOOKED,
      );
      if (booked.length >= maxCapacity) {
        throw new ConflictException('Wave window is fully booked');
      }

      const duplicate = booked.find((a) => a.patientId === patient.id);
      if (duplicate) {
        throw new ConflictException(
          `Duplicate booking: you already have a BOOKED WAVE appointment with this doctor on ${dto.date}`,
        );
      }

      const maxToken = dayAppointments.reduce(
        (max, a) => Math.max(max, a.tokenNumber ?? 0),
        0,
      );
      const nextToken = maxToken + 1;

      const appointment = manager.create(Appointment, {
        doctorId: doctor.id,
        patientId: patient.id,
        appointmentType: SchedulingType.WAVE,
        date: dto.date,
        startTime: wave.startTime,
        endTime: wave.endTime,
        tokenNumber: nextToken,
        status: AppointmentStatus.BOOKED,
      });

      return manager.save(appointment);
    });

    await this.notifyBooked(saved, doctor);
    return saved;
  }
}
