import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppointmentController } from '../src/appointment/appointment.controller';
import { AppointmentService } from '../src/appointment/appointment.service';
import {
  JwtAuthGuard,
  RolesGuard,
} from '../src/auth/auth.security';
import { SchedulingType } from '../src/scheduling/entities/doctor-schedule-config.entity';

/**
 * Light e2e: wires the reschedule route with a mocked service (no DB).
 */
describe('Appointment reschedule (e2e light)', () => {
  let app: INestApplication<App>;
  const appointmentService = {
    reschedule: jest.fn(),
    cancel: jest.fn(),
    book: jest.fn(),
    listMine: jest.fn(),
    listForDoctor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [
        { provide: AppointmentService, useValue: appointmentService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => {
            getRequest: () => { user: { userId: string; role: string } };
          };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { userId: 'user-pat', role: 'PATIENT' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('PATCH /appointment/:id/reschedule delegates to service', async () => {
    appointmentService.reschedule.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      appointmentType: SchedulingType.STREAM,
    });

    await request(app.getHttpServer())
      .patch('/appointment/11111111-1111-4111-8111-111111111111/reschedule')
      .send({
        schedulingType: 'STREAM',
        slotId: '22222222-2222-4222-8222-222222222222',
        date: '2026-09-21',
        startTime: '11:00',
        endTime: '11:15',
      })
      .expect(200);

    expect(appointmentService.reschedule).toHaveBeenCalledWith(
      'user-pat',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        schedulingType: SchedulingType.STREAM,
        slotId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('rejects invalid schedulingType with 400', async () => {
    await request(app.getHttpServer())
      .patch('/appointment/11111111-1111-4111-8111-111111111111/reschedule')
      .send({
        schedulingType: 'INVALID',
        date: '2026-09-21',
      })
      .expect(400);
  });
});
