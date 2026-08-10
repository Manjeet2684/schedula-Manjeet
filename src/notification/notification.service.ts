import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../patient/patient.entity';
import {
  Notification,
  NotificationType,
} from './notification.entity';

export type AppointmentNotificationInput = {
  type: NotificationType;
  appointmentId: string;
  patientId: string;
  doctorName: string;
  date: string;
  time: string;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  private normalizeTime(time: string): string {
    return String(time).slice(0, 5);
  }

  private buildContent(
    type: NotificationType,
    doctorName: string,
    date: string,
    time: string,
  ): { title: string; message: string } {
    const displayTime = this.normalizeTime(time);
    const doctorLabel = doctorName.startsWith('Dr.')
      ? doctorName
      : `Dr. ${doctorName}`;

    switch (type) {
      case NotificationType.APPOINTMENT_BOOKED:
        return {
          title: 'Appointment booked',
          message: `Your appointment with ${doctorLabel} has been booked successfully for ${date} at ${displayTime}.`,
        };
      case NotificationType.APPOINTMENT_CANCELLED:
        return {
          title: 'Appointment cancelled',
          message: `Your appointment scheduled on ${date} at ${displayTime} has been cancelled.`,
        };
      case NotificationType.APPOINTMENT_RESCHEDULED:
        return {
          title: 'Appointment rescheduled',
          message: `Your appointment has been rescheduled to ${date} at ${displayTime}.`,
        };
      default:
        return {
          title: 'Appointment update',
          message: `Your appointment on ${date} at ${displayTime} was updated.`,
        };
    }
  }

  /**
   * Creates an appointment lifecycle notification.
   * Idempotent on (appointmentId + type). Skips quietly when the patient is
   * missing or a duplicate already exists.
   */
  async createAppointmentNotification(
    input: AppointmentNotificationInput,
  ): Promise<Notification | null> {
    const patient = await this.patientRepo.findOne({
      where: { id: input.patientId },
    });
    if (!patient) {
      this.logger.warn(
        `Skipping ${input.type} notification: patient ${input.patientId} not found (appointment ${input.appointmentId})`,
      );
      return null;
    }

    const existing = await this.notificationRepo.findOne({
      where: {
        appointmentId: input.appointmentId,
        type: input.type,
      },
    });
    if (existing) {
      return existing;
    }

    const { title, message } = this.buildContent(
      input.type,
      input.doctorName,
      input.date,
      input.time,
    );

    try {
      const row = this.notificationRepo.create({
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        type: input.type,
        title,
        message,
        isRead: false,
      });
      return await this.notificationRepo.save(row);
    } catch (err) {
      // Concurrent duplicate insert (unique appointmentId+type) → treat as no-op.
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === '23505') {
        return this.notificationRepo.findOne({
          where: {
            appointmentId: input.appointmentId,
            type: input.type,
          },
        });
      }
      throw err;
    }
  }

  async listForUser(userId: string): Promise<Notification[]> {
    const patient = await this.patientRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException(
        'Patient profile not found. Create a patient profile before viewing notifications.',
      );
    }

    return this.notificationRepo.find({
      where: { patientId: patient.id },
      order: { createdAt: 'DESC' },
    });
  }
}
