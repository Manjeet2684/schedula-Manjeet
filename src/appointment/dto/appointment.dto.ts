import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { SchedulingType } from '../../scheduling/entities/doctor-schedule-config.entity';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAppointmentDto {
  @IsUUID('4', { message: 'doctorId must be a valid UUID' })
  doctorId!: string;

  @IsUUID('4', { message: 'slotId must be a valid UUID' })
  slotId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'date must be a valid calendar date in YYYY-MM-DD format',
  })
  date!: string;

  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'startTime must be in HH:mm format (00:00–23:59)',
  })
  startTime!: string;

  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'endTime must be in HH:mm format (00:00–23:59)',
  })
  endTime!: string;
}

export class RescheduleAppointmentDto {
  @IsEnum(SchedulingType, {
    message: 'schedulingType must be STREAM or WAVE',
  })
  schedulingType!: SchedulingType;

  @ValidateIf(
    (o: RescheduleAppointmentDto) =>
      o.schedulingType === SchedulingType.STREAM,
  )
  @IsUUID('4', { message: 'slotId must be a valid UUID' })
  slotId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'date must be a valid calendar date in YYYY-MM-DD format',
  })
  date!: string;

  @ValidateIf(
    (o: RescheduleAppointmentDto) =>
      o.schedulingType === SchedulingType.STREAM,
  )
  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'startTime must be in HH:mm format (00:00–23:59)',
  })
  startTime?: string;

  @ValidateIf(
    (o: RescheduleAppointmentDto) =>
      o.schedulingType === SchedulingType.STREAM,
  )
  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'endTime must be in HH:mm format (00:00–23:59)',
  })
  endTime?: string;
}
