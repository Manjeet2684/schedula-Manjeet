import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDoctorDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  specialization!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experience!: number;

  @IsString()
  @IsNotEmpty()
  qualification!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultationFee!: number;

  @IsString()
  @IsNotEmpty()
  availability!: string;

  @IsString()
  @IsNotEmpty()
  profileDetails!: string;
}

export class UpdateDoctorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  specialization?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experience?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  qualification?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  consultationFee?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  availability?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profileDetails?: string;
}
