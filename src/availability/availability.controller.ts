import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AvailabilityService } from './availability.service';
import {
  CreateCustomAvailabilityDto,
  CreateRecurringAvailabilityDto,
  EffectiveDateQueryDto,
  ExpandAvailabilityDto,
  UpdateRecurringAvailabilityDto,
} from './dto/availability.dto';

@Controller('doctor/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  createRecurring(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: CreateRecurringAvailabilityDto,
  ) {
    return this.availabilityService.createRecurring(req.user.userId, dto);
  }

  @Get()
  listRecurring(@Req() req: { user: JwtPayloadUser }) {
    return this.availabilityService.listRecurring(req.user.userId);
  }

  /** Must be declared before :id routes so "date" / "override" are not captured as ids. */
  @Get('date')
  getEffectiveForDate(
    @Req() req: { user: JwtPayloadUser },
    @Query() query: EffectiveDateQueryDto,
  ) {
    return this.availabilityService.getEffectiveForDate(
      req.user.userId,
      query.date,
    );
  }

  @Post('override')
  createOverride(
    @Req() req: { user: JwtPayloadUser },
    @Body() dto: CreateCustomAvailabilityDto,
  ) {
    return this.availabilityService.upsertOverride(req.user.userId, dto);
  }

  /** More specific than PATCH :id — must be registered first. */
  @Patch(':id/expand')
  expand(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpandAvailabilityDto,
  ) {
    return this.availabilityService.expand(req.user.userId, id, dto);
  }

  @Patch(':id')
  updateRecurring(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringAvailabilityDto,
  ) {
    return this.availabilityService.updateRecurring(req.user.userId, id, dto);
  }

  @Delete(':id')
  deleteRecurring(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.availabilityService.deleteRecurring(req.user.userId, id);
  }
}
