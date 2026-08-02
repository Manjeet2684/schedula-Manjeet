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
import { CreateDoctorDto, UpdateDoctorDto } from './doctor.dto';
import { DoctorService } from './doctor.service';

@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Post('profile')
  createProfile(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: CreateDoctorDto,
  ) {
    return this.doctorService.createProfile(req.user.userId, dto);
  }

  @Get('profile')
  getProfile(@Req() req: { user: JwtPayloadUser }) {
    return this.doctorService.getProfile(req.user.userId);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: UpdateDoctorDto,
  ) {
    return this.doctorService.updateProfile(req.user.userId, dto);
  }
}
