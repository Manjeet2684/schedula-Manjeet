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

@Entity('custom_availability')
@Index('IDX_custom_availability_doctor_id', ['doctorId'])
@Index('IDX_custom_availability_doctor_date', ['doctorId', 'date'])
export class CustomAvailability {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'doctor_id' })
  doctorId!: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: Doctor;

  /** Calendar date only (YYYY-MM-DD), no time component. */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ type: 'boolean', default: false })
  isUnavailable!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
