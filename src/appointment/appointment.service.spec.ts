import {
  BadRequestException,
  ConflictException,
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
import { AvailabilityService } from '../availability/availability.service';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import {
  DoctorScheduleConfig,
  SchedulingType,
} from '../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../slots/slot.entity';
import { AppointmentService } from './appointment.service';
import { SlotUnavailableException } from './exceptions/slot-unavailable.exception';

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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const nearDate = (() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      startTime: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    };
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
    count: jest.fn(),
  };
  const slotRepo = {
    createQueryBuilder: jest.fn(),
  };
  const doctorRepo = {
    findOne: jest.fn(),
  };
  const patientRepo = {
    findOne: jest.fn(),
  };
  const configRepo = {
    findOne: jest.fn(),
  };
  const availabilityService = {
    getEffectiveForDate: jest.fn(),
  };

  const manager = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
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
    manager.save.mockImplementation(async (entity) => entity);
    manager.findOne.mockResolvedValue(doctor);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getRepositoryToken(Appointment), useValue: appointmentRepo },
        { provide: getRepositoryToken(Slot), useValue: slotRepo },
        { provide: getRepositoryToken(Doctor), useValue: doctorRepo },
        { provide: getRepositoryToken(Patient), useValue: patientRepo },
        {
          provide: getRepositoryToken(DoctorScheduleConfig),
          useValue: configRepo,
        },
        { provide: AvailabilityService, useValue: availabilityService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(AppointmentService);
  });

  function mockLockSequence(
    results: Array<{ getOne?: unknown; getMany?: unknown[] }>,
  ) {
    let call = 0;
    manager.createQueryBuilder.mockImplementation(() => {
      const idx = call++;
      const entry = results[idx] ?? results[results.length - 1];
      return {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(entry.getOne ?? null),
        getMany: jest.fn().mockResolvedValue(entry.getMany ?? []),
      };
    });
  }

  function baseAppt(overrides: Partial<Appointment> = {}): Appointment {
    return {
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
      ...overrides,
    } as Appointment;
  }

  it('books a free matching slot', async () => {
    mockLockSequence([{ getOne: { ...slot, isBooked: false } }]);
    manager.create.mockImplementation((_cls, data) => ({
      id: 'appt-1',
      ...data,
    }));
    manager.findOneOrFail.mockResolvedValue(baseAppt());

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
    mockLockSequence([{ getOne: { ...slot, isBooked: true } }]);

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
    mockLockSequence([{ getOne: null }]);
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
    const appt = baseAppt();
    mockLockSequence([
      { getOne: appt },
      { getOne: { ...slot, isBooked: true } },
    ]);
    manager.findOneOrFail.mockResolvedValue({
      ...appt,
      status: AppointmentStatus.CANCELLED,
      slot: { ...slot, isBooked: false },
    });

    const result = await service.cancel('user-pat', 'appt-1');
    expect(result.status).toBe(AppointmentStatus.CANCELLED);
  });

  it('forbids cancelling another patient appointment', async () => {
    mockLockSequence([
      {
        getOne: {
          id: 'appt-1',
          patientId: 'other-patient',
          status: AppointmentStatus.BOOKED,
          date: futureDate,
          startTime: '10:00',
        },
      },
    ]);

    await expect(
      service.cancel('user-pat', 'appt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects re-cancel', async () => {
    mockLockSequence([
      {
        getOne: {
          id: 'appt-1',
          patientId: patient.id,
          status: AppointmentStatus.CANCELLED,
          date: futureDate,
          startTime: '10:00',
        },
      },
    ]);

    await expect(
      service.cancel('user-pat', 'appt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks cancel within 30-minute cutoff', async () => {
    mockLockSequence([
      {
        getOne: baseAppt({
          date: nearDate.date,
          startTime: nearDate.startTime,
          endTime: nearDate.startTime,
        }),
      },
    ]);

    await expect(
      service.cancel('user-pat', 'appt-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('reschedule', () => {
    it('reschedules STREAM to a free slot atomically', async () => {
      const appt = baseAppt();
      const target = {
        id: 'slot-2',
        doctorId: 'doc-1',
        date: futureDate,
        startTime: '11:00',
        endTime: '11:15',
        isBooked: false,
      } as Slot;

      mockLockSequence([
        { getOne: appt },
        { getOne: target },
        { getOne: { ...slot, isBooked: true } },
      ]);
      manager.findOneOrFail.mockResolvedValue(
        baseAppt({
          slotId: 'slot-2',
          startTime: '11:00',
          endTime: '11:15',
          slot: { ...target, isBooked: true },
        }),
      );

      const result = await service.reschedule('user-pat', 'appt-1', {
        schedulingType: SchedulingType.STREAM,
        slotId: 'slot-2',
        date: futureDate,
        startTime: '11:00',
        endTime: '11:15',
      });

      expect(result.slotId).toBe('slot-2');
      expect(result.startTime).toBe('11:00');
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('reschedules STREAM → WAVE and releases old slot', async () => {
      const appt = baseAppt();
      const nextDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 21);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      mockLockSequence([
        { getOne: appt },
        {
          getOne: {
            doctorId: doctor.id,
            maxCapacity: 5,
            schedulingType: SchedulingType.WAVE,
          },
        },
        { getMany: [] },
        { getOne: { ...slot, isBooked: true } },
      ]);

      availabilityService.getEffectiveForDate.mockResolvedValue([
        { startTime: '09:00', endTime: '12:00' },
      ]);
      manager.findOneOrFail.mockResolvedValue(
        baseAppt({
          slotId: null,
          date: nextDate,
          startTime: '09:00',
          endTime: '12:00',
          appointmentType: SchedulingType.WAVE,
          tokenNumber: 1,
          slot: null,
        }),
      );

      const result = await service.reschedule('user-pat', 'appt-1', {
        schedulingType: SchedulingType.WAVE,
        date: nextDate,
      });

      expect(result.appointmentType).toBe(SchedulingType.WAVE);
      expect(result.tokenNumber).toBe(1);
      expect(result.slotId).toBeNull();
    });

    it('reschedules WAVE → STREAM, clears token, books slot', async () => {
      const appt = baseAppt({
        slotId: null,
        appointmentType: SchedulingType.WAVE,
        tokenNumber: 2,
        startTime: '09:00',
        endTime: '12:00',
      });
      const target = {
        id: 'slot-3',
        doctorId: 'doc-1',
        date: futureDate,
        startTime: '14:00',
        endTime: '14:15',
        isBooked: false,
      } as Slot;

      mockLockSequence([{ getOne: appt }, { getOne: target }]);
      manager.findOneOrFail.mockResolvedValue(
        baseAppt({
          slotId: 'slot-3',
          startTime: '14:00',
          endTime: '14:15',
          appointmentType: SchedulingType.STREAM,
          tokenNumber: null,
          slot: { ...target, isBooked: true },
        }),
      );

      const result = await service.reschedule('user-pat', 'appt-1', {
        schedulingType: SchedulingType.STREAM,
        slotId: 'slot-3',
        date: futureDate,
        startTime: '14:00',
        endTime: '14:15',
      });

      expect(result.appointmentType).toBe(SchedulingType.STREAM);
      expect(result.tokenNumber).toBeNull();
      expect(result.slotId).toBe('slot-3');
    });

    it('forbids non-owner reschedule', async () => {
      mockLockSequence([
        {
          getOne: baseAppt({ patientId: 'other-patient' }),
        },
      ]);

      await expect(
        service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-2',
          date: futureDate,
          startTime: '11:00',
          endTime: '11:15',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects cancelled appointment reschedule', async () => {
      mockLockSequence([
        {
          getOne: baseAppt({ status: AppointmentStatus.CANCELLED }),
        },
      ]);

      await expect(
        service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-2',
          date: futureDate,
          startTime: '11:00',
          endTime: '11:15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing appointment', async () => {
      mockLockSequence([{ getOne: null }]);

      await expect(
        service.reschedule('user-pat', '00000000-0000-4000-8000-000000000099', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-2',
          date: futureDate,
          startTime: '11:00',
          endTime: '11:15',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks reschedule within 30-minute cutoff', async () => {
      mockLockSequence([
        {
          getOne: baseAppt({
            date: nearDate.date,
            startTime: nearDate.startTime,
          }),
        },
      ]);

      await expect(
        service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-2',
          date: futureDate,
          startTime: '11:00',
          endTime: '11:15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects past target time', async () => {
      mockLockSequence([{ getOne: baseAppt() }]);

      await expect(
        service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-past',
          date: '2020-01-06',
          startTime: '09:00',
          endTime: '09:15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects same STREAM slot/time', async () => {
      mockLockSequence([{ getOne: baseAppt() }]);

      await expect(
        service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-1',
          date: futureDate,
          startTime: '10:00',
          endTime: '10:15',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 409 with suggested STREAM slot when target is booked', async () => {
      const appt = baseAppt();
      const bookedTarget = {
        id: 'slot-2',
        doctorId: 'doc-1',
        date: futureDate,
        startTime: '11:00',
        endTime: '11:15',
        isBooked: true,
      } as Slot;
      const alt = {
        id: 'slot-3',
        doctorId: 'doc-1',
        date: futureDate,
        startTime: '11:30',
        endTime: '11:45',
        isBooked: false,
      } as Slot;

      mockLockSequence([{ getOne: appt }, { getOne: bookedTarget }]);
      slotRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([alt]),
      });

      try {
        await service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-2',
          date: futureDate,
          startTime: '11:00',
          endTime: '11:15',
        });
        fail('expected SlotUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(SlotUnavailableException);
        expect(err).toBeInstanceOf(ConflictException);
        const body = (err as ConflictException).getResponse() as Record<
          string,
          unknown
        >;
        expect(body.error).toBe('SlotUnavailable');
        expect(body.suggestedSlot).toEqual({
          slotId: 'slot-3',
          date: futureDate,
          startTime: '11:30',
          endTime: '11:45',
          schedulingType: SchedulingType.STREAM,
        });
      }
    });

    it('returns 409 with next-day WAVE suggestion when wave is full', async () => {
      const appt = baseAppt();
      const nextDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 15);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const dayAfter = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 16);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      mockLockSequence([
        { getOne: appt },
        {
          getOne: {
            doctorId: doctor.id,
            maxCapacity: 1,
            schedulingType: SchedulingType.WAVE,
          },
        },
        {
          getMany: [
            {
              id: 'other',
              status: AppointmentStatus.BOOKED,
              tokenNumber: 1,
            },
          ],
        },
      ]);

      availabilityService.getEffectiveForDate
        .mockResolvedValueOnce([{ startTime: '09:00', endTime: '12:00' }])
        .mockResolvedValueOnce([{ startTime: '09:00', endTime: '12:00' }]);
      appointmentRepo.count.mockResolvedValue(0);

      try {
        await service.reschedule('user-pat', 'appt-1', {
          schedulingType: SchedulingType.WAVE,
          date: nextDate,
        });
        fail('expected SlotUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(SlotUnavailableException);
        const body = (err as ConflictException).getResponse() as {
          suggestedSlot: { slotId: null; date: string; schedulingType: string };
        };
        expect(body.suggestedSlot.slotId).toBeNull();
        expect(body.suggestedSlot.date).toBe(dayAfter);
        expect(body.suggestedSlot.schedulingType).toBe(SchedulingType.WAVE);
      }
    });

    it('serializes concurrent STREAM race: second caller gets 409', async () => {
      const apptA = baseAppt({ id: 'appt-a', patientId: patient.id });
      const apptB = baseAppt({
        id: 'appt-b',
        patientId: patient.id,
        slotId: 'slot-old',
        startTime: '09:00',
        endTime: '09:15',
      });
      const freeThenBooked = {
        id: 'slot-race',
        doctorId: 'doc-1',
        date: futureDate,
        startTime: '15:00',
        endTime: '15:15',
        isBooked: false,
      };

      // First reschedule wins
      mockLockSequence([
        { getOne: apptA },
        { getOne: { ...freeThenBooked } },
        { getOne: { ...slot, isBooked: true } },
      ]);
      manager.findOneOrFail.mockResolvedValue(
        baseAppt({
          id: 'appt-a',
          slotId: 'slot-race',
          startTime: '15:00',
          endTime: '15:15',
        }),
      );

      await service.reschedule('user-pat', 'appt-a', {
        schedulingType: SchedulingType.STREAM,
        slotId: 'slot-race',
        date: futureDate,
        startTime: '15:00',
        endTime: '15:15',
      });

      // Second caller sees booked under lock
      mockLockSequence([
        { getOne: apptB },
        { getOne: { ...freeThenBooked, isBooked: true } },
      ]);
      slotRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'slot-alt',
            date: futureDate,
            startTime: '15:30',
            endTime: '15:45',
            isBooked: false,
          },
        ]),
      });

      await expect(
        service.reschedule('user-pat', 'appt-b', {
          schedulingType: SchedulingType.STREAM,
          slotId: 'slot-race',
          date: futureDate,
          startTime: '15:00',
          endTime: '15:15',
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableException);
    });

    it('assigns next WAVE token without gap-fill (max+1)', async () => {
      const appt = baseAppt();
      const waveDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 20);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();

      mockLockSequence([
        { getOne: appt },
        {
          getOne: {
            doctorId: doctor.id,
            maxCapacity: 10,
            schedulingType: SchedulingType.WAVE,
          },
        },
        {
          getMany: [
            {
              id: 'w1',
              status: AppointmentStatus.CANCELLED,
              tokenNumber: 1,
            },
            {
              id: 'w2',
              status: AppointmentStatus.BOOKED,
              tokenNumber: 3,
            },
          ],
        },
        { getOne: { ...slot, isBooked: true } },
      ]);
      availabilityService.getEffectiveForDate.mockResolvedValue([
        { startTime: '09:00', endTime: '12:00' },
      ]);

      let savedAppt: Appointment | undefined;
      manager.save.mockImplementation(async (entity: Appointment) => {
        if (entity && 'tokenNumber' in entity && entity.id === 'appt-1') {
          savedAppt = entity;
        }
        return entity;
      });
      manager.findOneOrFail.mockImplementation(async () => ({
        ...appt,
        ...savedAppt,
        doctor,
        patient,
        slot: null,
      }));

      const result = await service.reschedule('user-pat', 'appt-1', {
        schedulingType: SchedulingType.WAVE,
        date: waveDate,
      });

      expect(result.tokenNumber).toBe(4);
    });
  });
});
