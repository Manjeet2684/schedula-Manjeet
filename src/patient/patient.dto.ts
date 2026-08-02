import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  age!: number;

  @IsString()
  @IsNotEmpty()
  gender!: string;

  @IsString()
  @IsNotEmpty()
  contactDetails!: string;

  @IsOptional()
  @IsString()
  healthInformation?: string;
}

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  age?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  gender?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contactDetails?: string;

  @IsOptional()
  @IsString()
  healthInformation?: string;
}
