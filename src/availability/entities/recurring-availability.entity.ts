import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Doctor } from '../../doctor/doctor.entity';

export enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

@Entity('recurring_availability')
@Index('IDX_recurring_availability_doctor_id', ['doctorId'])
@Index('IDX_recurring_availability_doctor_day', ['doctorId', 'dayOfWeek'])
export class RecurringAvailability {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'doctor_id' })
  doctorId!: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: Doctor;

  @Column({ type: 'enum', enum: DayOfWeek })
  dayOfWeek!: DayOfWeek;

  /** Local wall-clock time as HH:mm:ss (no timezone). */
  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ type: 'int', nullable: true })
  slotDuration?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
