import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column()
  fullName!: string;

  @Column()
  specialization!: string;

  @Column({ type: 'int' })
  experience!: number;

  @Column()
  qualification!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  consultationFee!: number;

  @Column({ type: 'text' })
  availability!: string;

  @Column({ type: 'text' })
  profileDetails!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
