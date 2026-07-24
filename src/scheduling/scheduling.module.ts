import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityModule } from '../availability/availability.module';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { DoctorScheduleConfig } from './entities/doctor-schedule-config.entity';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { SchedulingValidationService } from './scheduling-validation.service';

/**
 * Day 5 — STREAM / WAVE scheduling.
 * Owns schedule-config + appointment booking; reuses Day 4 AvailabilityModule
 * for effective time windows. Appointment entity lives under src/appointments/.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DoctorScheduleConfig,
      Appointment,
      Doctor,
      Patient,
    ]),
    AuthModule,
    AvailabilityModule,
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, SchedulingValidationService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
