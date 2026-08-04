import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  JwtPayloadUser,
  Roles,
  RolesGuard,
} from '../auth/auth.security';
import { Role } from '../users/user.entity';
import { AppointmentService } from './appointment.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';

@Controller()
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post('appointment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  book(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentService.book(req.user.userId, dto);
  }

  @Get('appointment/my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  listMine(@Req() req: { user: JwtPayloadUser }) {
    return this.appointmentService.listMine(req.user.userId);
  }

  @Patch('appointment/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  cancel(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.appointmentService.cancel(req.user.userId, id);
  }

  @Patch('appointment/:id/reschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  reschedule(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentService.reschedule(req.user.userId, id, dto);
  }

  @Get('doctor/appointments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  listForDoctor(@Req() req: { user: JwtPayloadUser }) {
    return this.appointmentService.listForDoctor(req.user.userId);
  }
}
