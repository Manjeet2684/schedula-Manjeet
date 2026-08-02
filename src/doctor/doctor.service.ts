import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDoctorDto, UpdateDoctorDto } from './doctor.dto';
import { Doctor } from './doctor.entity';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
  ) {}

  async createProfile(userId: string, dto: CreateDoctorDto): Promise<Doctor> {
    const existing = await this.doctorRepo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Doctor profile already exists');
    }

    const doctor = this.doctorRepo.create({ ...dto, userId });
    return this.doctorRepo.save(doctor);
  }

  async getProfile(userId: string): Promise<Doctor> {
    const doctor = await this.doctorRepo.findOne({ where: { userId } });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }
    return doctor;
  }

  async updateProfile(userId: string, dto: UpdateDoctorDto): Promise<Doctor> {
    const doctor = await this.getProfile(userId);
    Object.assign(doctor, dto);
    return this.doctorRepo.save(doctor);
  }
}
