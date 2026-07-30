import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityModule } from '../availability/availability.module';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { Slot } from '../slots/slot.entity';
import { DoctorScheduleConfig } from './entities/doctor-schedule-config.entity';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingValidationService } from './scheduling-validation.service';

/**
 * Day 5 — STREAM / WAVE scheduling.
 * Materializes STREAM Slot rows for Day 6 booking APIs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DoctorScheduleConfig,
      Appointment,
      Doctor,
      Patient,
      Slot,
    ]),
    AuthModule,
    AvailabilityModule,
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingValidationService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
