import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '../../users/user.entity';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(Role, { message: "role must be 'DOCTOR' or 'PATIENT'" })
  role!: Role;

  @IsString()
  @MinLength(2)
  fullName!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
