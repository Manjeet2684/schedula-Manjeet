import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Doctor } from '../doctor/doctor.entity';
import { DoctorScheduleConfig } from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityValidationService } from './availability-validation.service';
import { CustomAvailability } from './entities/custom-availability.entity';
import { RecurringAvailability } from './entities/recurring-availability.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecurringAvailability,
      CustomAvailability,
      Doctor,
      Slot,
      DoctorScheduleConfig,
    ]),
    AuthModule,
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityValidationService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
