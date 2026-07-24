import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
import {
  BookAppointmentDto,
  SlotsQueryDto,
  UpsertScheduleConfigDto,
} from './dto/scheduling.dto';
import { SchedulingService } from './scheduling.service';

@Controller()
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Post('doctor/schedule-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  upsertConfig(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: UpsertScheduleConfigDto,
  ) {
    return this.schedulingService.upsertScheduleConfig(req.user.userId, dto);
  }

  @Get('doctor/schedule-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  getConfig(@Req() req: { user: JwtPayloadUser }) {
    return this.schedulingService.getScheduleConfig(req.user.userId);
  }

  /** Public slot listing — no auth required (patients can browse availability). */
  @Get('patient/appointments/slots')
  getSlots(@Query() query: SlotsQueryDto) {
    return this.schedulingService.getSlots(query.doctorId, query.date);
  }

  @Post('patient/appointments/book')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  book(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: BookAppointmentDto,
  ) {
    return this.schedulingService.bookAppointment(req.user.userId, dto);
  }
}
