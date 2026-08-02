import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';

/**
 * Persisted STREAM slot (materialized from Day 5 schedule + Day 4 availability).
 * Deploy-safe: unique per doctor/date/window so Railway/Render migrations stay idempotent.
 */
@Entity('slots')
@Unique('UQ_slots_doctor_date_start_end', [
  'doctorId',
  'date',
  'startTime',
  'endTime',
])
@Index('IDX_slots_doctor_date', ['doctorId', 'date'])
export class Slot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'doctor_id' })
  doctorId!: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: Doctor;

  /** Calendar date only (YYYY-MM-DD). */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ type: 'boolean', default: false })
  isBooked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
