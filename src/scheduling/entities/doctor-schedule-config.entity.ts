import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Doctor } from '../../doctor/doctor.entity';

export enum SchedulingType {
  STREAM = 'STREAM',
  WAVE = 'WAVE',
}

@Entity('doctor_schedule_configs')
export class DoctorScheduleConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'doctor_id', unique: true })
  doctorId!: string;

  @OneToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: Doctor;

  @Column({ type: 'enum', enum: SchedulingType })
  schedulingType!: SchedulingType;

  /** STREAM: length of each exact appointment slot in minutes. */
  @Column({ type: 'int', nullable: true })
  slotDuration?: number | null;

  /** STREAM: gap between consecutive slots in minutes (default 0). */
  @Column({ type: 'int', nullable: true, default: 0 })
  bufferTime?: number | null;

  /** WAVE: max patients allowed in the availability window. */
  @Column({ type: 'int', nullable: true })
  maxCapacity?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
