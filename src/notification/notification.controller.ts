import {
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
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
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** Newest notifications first. */
  @Get()
  listMine(@Req() req: { user: JwtPayloadUser }) {
    return this.notificationService.listForUser(req.user.userId);
  }

  /**
   * Mark a notification as read.
   * Patient-scoped via JWT (cannot mark others' notifications).
   */
  @Patch(':id/read')
  markRead(
    @Req() req: { user: JwtPayloadUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsRead(req.user.userId, id);
  }
}
