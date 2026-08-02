import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { DayOfWeek } from '../entities/recurring-availability.entity';

const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export class RecurringSlotDto {
  @IsEnum(DayOfWeek, {
    message:
      'dayOfWeek must be one of MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek!: DayOfWeek;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slotDuration?: number;
}

export class CreateRecurringAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one recurring slot is required' })
  @ValidateNested({ each: true })
  @Type(() => RecurringSlotDto)
  slots!: RecurringSlotDto[];
}

export class UpdateRecurringAvailabilityDto {
  @IsOptional()
  @IsEnum(DayOfWeek, {
    message:
      'dayOfWeek must be one of MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek?: DayOfWeek;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slotDuration?: number | null;
}

export class CreateCustomAvailabilityDto {
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

  @IsOptional()
  @IsBoolean()
  isUnavailable?: boolean;
}

export class EffectiveDateQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(DATE_YYYY_MM_DD, {
    message: 'date query param must be YYYY-MM-DD',
  })
  date!: string;
}
