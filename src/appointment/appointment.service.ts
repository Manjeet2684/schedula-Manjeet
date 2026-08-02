import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { SchedulingType } from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import { CreateAppointmentDto } from './dto/appointment.dto';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Slot)
    private readonly slotRepo: Repository<Slot>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    private readonly dataSource: DataSource,
  ) {}

  private normalizeTime(time: string): string {
    const parts = time.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }

  private fromDbTime(time: string): string {
    return this.normalizeTime(String(time).slice(0, 5));
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

    return this.dataSource.transaction(async (manager) => {
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
      const slotDate =
        typeof slot.date === 'string'
          ? slot.date.slice(0, 10)
          : new Date(slot.date).toISOString().slice(0, 10);

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

    return this.dataSource.transaction(async (manager) => {
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

      const apptDate =
        typeof appointment.date === 'string'
          ? appointment.date.slice(0, 10)
          : String(appointment.date).slice(0, 10);

      try {
        this.assertNotPast(
          apptDate,
          this.fromDbTime(String(appointment.startTime)),
        );
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw new BadRequestException(
            'Past appointments cannot be cancelled',
          );
        }
        throw err;
      }

      appointment.status = AppointmentStatus.CANCELLED;
      await manager.save(appointment);

      if (appointment.slotId) {
        const slot = await manager
          .createQueryBuilder(Slot, 's')
          .setLock('pessimistic_write')
          .where('s.id = :id', { id: appointment.slotId })
          .getOne();
        if (slot) {
          slot.isBooked = false;
          await manager.save(slot);
        }
      }

      return this.toResponse(
        await manager.findOneOrFail(Appointment, {
          where: { id: appointment.id },
          relations: ['doctor', 'patient', 'slot'],
        }),
      );
    });
  }
}
