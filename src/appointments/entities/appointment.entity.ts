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
import { Patient } from '../../patient/patient.entity';
import { SchedulingType } from '../../scheduling/entities/doctor-schedule-config.entity';
import { Slot } from '../../slots/slot.entity';

export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CANCELLED = 'CANCELLED',
}

@Entity('appointments')
@Index('IDX_appointments_doctor_date', ['doctorId', 'date'])
@Index('IDX_appointments_patient_doctor_date', ['patientId', 'doctorId', 'date'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'doctor_id' })
  doctorId!: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: Doctor;

  @Column({ name: 'patient_id' })
  patientId!: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient!: Patient;

  /** STREAM bookings link to a persisted Slot; WAVE stays null. */
  @Column({ name: 'slot_id', type: 'uuid', nullable: true })
  slotId?: string | null;

  @ManyToOne(() => Slot, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'slot_id' })
  slot?: Slot | null;

  @Column({ type: 'enum', enum: SchedulingType })
  appointmentType!: SchedulingType;

  /** Calendar date only (YYYY-MM-DD). Exposed as appointmentDate in Day 6 APIs. */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  /** WAVE only — sequential token within the doctor's day window. */
  @Column({ type: 'int', nullable: true })
  tokenNumber?: number | null;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.BOOKED,
  })
  status!: AppointmentStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
