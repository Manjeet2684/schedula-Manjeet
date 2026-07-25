import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePatientDto, UpdatePatientDto } from './patient.dto';
import { Patient } from './patient.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  async createProfile(userId: string, dto: CreatePatientDto): Promise<Patient> {
    const existing = await this.patientRepo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Patient profile already exists');
    }

    const patient = this.patientRepo.create({ ...dto, userId });
    return this.patientRepo.save(patient);
  }

  async getProfile(userId: string): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { userId } });
    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }
    return patient;
  }

  async updateProfile(
    userId: string,
    dto: UpdatePatientDto,
  ): Promise<Patient> {
    const patient = await this.getProfile(userId);
    Object.assign(patient, dto);
    return this.patientRepo.save(patient);
  }
}
