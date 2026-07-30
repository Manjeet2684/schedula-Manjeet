import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../appointments/entities/appointment.entity';
import { AuthModule } from '../auth/auth.module';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { Slot } from '../slots/slot.entity';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

/**
 * Day 6 — slot-based appointment booking & management.
 * Reuses Day 5 persisted Slot rows (materialized by SchedulingService).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Slot, Doctor, Patient]),
    AuthModule,
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
