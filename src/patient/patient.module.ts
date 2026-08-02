import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PatientController } from './patient.controller';
import { Patient } from './patient.entity';
import { PatientService } from './patient.service';

@Module({
  imports: [TypeOrmModule.forFeature([Patient]), AuthModule],
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
