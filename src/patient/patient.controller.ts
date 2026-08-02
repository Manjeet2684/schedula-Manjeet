import {
  Body,
  Controller,
  Get,
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
import { CreatePatientDto, UpdatePatientDto } from './patient.dto';
import { PatientService } from './patient.service';

@Controller('patient')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('profile')
  createProfile(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: CreatePatientDto,
  ) {
    return this.patientService.createProfile(req.user.userId, dto);
  }

  @Get('profile')
  getProfile(@Req() req: { user: JwtPayloadUser }) {
    return this.patientService.getProfile(req.user.userId);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientService.updateProfile(req.user.userId, dto);
  }
}
