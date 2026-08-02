import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { SchedulingType } from '../entities/doctor-schedule-config.entity';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class UpsertScheduleConfigDto {
  @IsEnum(SchedulingType, {
    message: 'schedulingType must be STREAM or WAVE',
  })
  schedulingType!: SchedulingType;

  @ValidateIf(
    (o: UpsertScheduleConfigDto) => o.schedulingType === SchedulingType.STREAM,
  )
  @Type(() => Number)
  @IsInt({ message: 'slotDuration must be an integer' })
  @Min(1, { message: 'slotDuration must be greater than 0' })
  slotDuration?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'bufferTime must be an integer' })
  @Min(0, { message: 'bufferTime cannot be negative' })
  bufferTime?: number;

  @ValidateIf(
    (o: UpsertScheduleConfigDto) => o.schedulingType === SchedulingType.WAVE,
  )
  @Type(() => Number)
  @IsInt({ message: 'maxCapacity must be an integer' })
  @Min(1, { message: 'maxCapacity must be greater than 0' })
  maxCapacity?: number;
}

export class SlotsQueryDto {
  @IsUUID('4', { message: 'doctorId must be a valid UUID' })
  doctorId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'date query param must be YYYY-MM-DD',
  })
  date!: string;
}

export class BookAppointmentDto {
  @IsUUID('4', { message: 'doctorId must be a valid UUID' })
  doctorId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'date must be a valid calendar date in YYYY-MM-DD format',
  })
  date!: string;

  /** Required for STREAM; optional for WAVE (filled from availability window). */
  @IsOptional()
  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'startTime must be in HH:mm format (00:00–23:59)',
  })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_HH_MM, {
    message: 'endTime must be in HH:mm format (00:00–23:59)',
  })
  endTime?: string;
}
