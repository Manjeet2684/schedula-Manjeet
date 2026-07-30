import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from '../appointments/entities/appointment.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { SchedulingType } from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import { AppointmentService } from './appointment.service';

describe('AppointmentService', () => {
  let service: AppointmentService;

  const patient = {
    id: 'pat-1',
    userId: 'user-pat',
    fullName: 'Pat',
  } as Patient;

  const doctor = {
    id: 'doc-1',
    userId: 'user-doc',
    fullName: 'Doc',
    specialization: 'GP',
    consultationFee: 500,
  } as Doctor;

  const futureDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    // Snap to a fixed YYYY-MM-DD
    return d.toISOString().slice(0, 10);
  })();

  const slot = {
    id: 'slot-1',
    doctorId: 'doc-1',
    date: futureDate,
    startTime: '10:00',
    endTime: '10:15',
    isBooked: false,
  } as Slot;

  const appointmentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const slotRepo = {};
  const doctorRepo = {
    findOne: jest.fn(),
  };
  const patientRepo = {
    findOne: jest.fn(),
  };

  const manager = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    findOneOrFail: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => unknown) =>
      cb(manager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    patientRepo.findOne.mockResolvedValue(patient);
    doctorRepo.findOne.mockResolvedValue(doctor);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepo },
        { provide: getRepositoryToken(Slot), useValue: slotRepo },
        { provide: getRepositoryToken(Doctor), useValue: doctorRepo },
        { provide: getRepositoryToken(Patient), useValue: patientRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(AppointmentService);
  });

  function mockSlotLock(locked: Slot | null) {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(locked),
    };
    manager.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  it('books a free matching slot', async () => {
    mockSlotLock({ ...slot, isBooked: false } as Slot);
    manager.save.mockImplementation(async (entity) => entity);
    manager.create.mockImplementation((_cls, data) => ({
      id: 'appt-1',
      ...data,
    }));
    manager.findOneOrFail.mockResolvedValue({
      id: 'appt-1',
      doctorId: doctor.id,
      patientId: patient.id,
      slotId: slot.id,
      date: futureDate,
      startTime: '10:00',
      endTime: '10:15',
      status: AppointmentStatus.BOOKED,
      appointmentType: SchedulingType.STREAM,
      tokenNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      doctor,
      patient,
      slot: { ...slot, isBooked: true },
    });

    const result = await service.book('user-pat', {
      doctorId: 'doc-1',
      slotId: 'slot-1',
      date: futureDate,
      startTime: '10:00',
      endTime: '10:15',
    });

    expect(result.status).toBe(AppointmentStatus.BOOKED);
    expect(result.slotId).toBe('slot-1');
  });

  it('rejects already booked slot', async () => {
    mockSlotLock({ ...slot, isBooked: true } as Slot);

    await expect(
      service.book('user-pat', {
        doctorId: 'doc-1',
        slotId: 'slot-1',
        date: futureDate,
        startTime: '10:00',
        endTime: '10:15',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing doctor', async () => {
    doctorRepo.findOne.mockResolvedValue(null);
    await expect(
      service.book('user-pat', {
        doctorId: 'missing',
        slotId: 'slot-1',
        date: futureDate,
        startTime: '10:00',
        endTime: '10:15',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing slot', async () => {
    mockSlotLock(null);
    await expect(
      service.book('user-pat', {
        doctorId: 'doc-1',
        slotId: 'missing-slot',
        date: futureDate,
        startTime: '10:00',
        endTime: '10:15',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists patient appointments (empty ok)', async () => {
    appointmentRepo.find.mockResolvedValue([]);
    await expect(service.listMine('user-pat')).resolves.toEqual([]);
  });

  it('lists doctor appointments', async () => {
    appointmentRepo.find.mockResolvedValue([]);
    await expect(service.listForDoctor('user-doc')).resolves.toEqual([]);
  });

  it('cancels own future appointment and releases slot', async () => {
    const appt = {
      id: 'appt-1',
      patientId: patient.id,
      doctorId: doctor.id,
      slotId: 'slot-1',
      date: futureDate,
      startTime: '10:00',
      endTime: '10:15',
      status: AppointmentStatus.BOOKED,
      appointmentType: SchedulingType.STREAM,
      tokenNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      doctor,
      patient,
      slot: { ...slot, isBooked: true },
    };

    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(appt)
        .mockResolvedValueOnce({ ...slot, isBooked: true }),
    };
    manager.createQueryBuilder.mockReturnValue(qb);
    manager.save.mockImplementation(async (e) => e);
    manager.findOneOrFail.mockResolvedValue({
      ...appt,
      status: AppointmentStatus.CANCELLED,
      slot: { ...slot, isBooked: false },
    });

    const result = await service.cancel('user-pat', 'appt-1');
    expect(result.status).toBe(AppointmentStatus.CANCELLED);
  });

  it('forbids cancelling another patient appointment', async () => {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'appt-1',
        patientId: 'other-patient',
        status: AppointmentStatus.BOOKED,
        date: futureDate,
        startTime: '10:00',
      }),
    };
    manager.createQueryBuilder.mockReturnValue(qb);

    await expect(
      service.cancel('user-pat', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects re-cancel', async () => {
    const qb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'appt-1',
        patientId: patient.id,
        status: AppointmentStatus.CANCELLED,
        date: futureDate,
        startTime: '10:00',
      }),
    };
    manager.createQueryBuilder.mockReturnValue(qb);

    await expect(
      service.cancel('user-pat', 'appt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
