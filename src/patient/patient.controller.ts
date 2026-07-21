import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
  JwtPayloadUser,
  Roles,
  RolesGuard,
} from '../auth/auth.security';
import { Role } from '../users/user.entity';

@Controller('patient')
export class PatientController {
  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PATIENT)
  getProfile(@Req() req: { user: JwtPayloadUser }) {
    return {
      message: 'Welcome Patient',
      user: req.user,
    };
  }
}
