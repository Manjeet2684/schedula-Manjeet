import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvancedSchedulingAndAppointments1753300000000
  implements MigrationInterface
{
  name = 'AddAdvancedSchedulingAndAppointments1753300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "doctor_schedule_configs_schedulingtype_enum" AS ENUM ('STREAM', 'WAVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appointments_appointmenttype_enum" AS ENUM ('STREAM', 'WAVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "appointments_status_enum" AS ENUM ('BOOKED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "doctor_schedule_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "schedulingType" "doctor_schedule_configs_schedulingtype_enum" NOT NULL,
        "slotDuration" integer,
        "bufferTime" integer DEFAULT 0,
        "maxCapacity" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_doctor_schedule_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_schedule_configs_doctor_id" UNIQUE ("doctor_id"),
        CONSTRAINT "FK_doctor_schedule_configs_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "appointmentType" "appointments_appointmenttype_enum" NOT NULL,
        "date" date NOT NULL,
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "tokenNumber" integer,
        "status" "appointments_status_enum" NOT NULL DEFAULT 'BOOKED',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appointments_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointments_patient_id" FOREIGN KEY ("patient_id")
          REFERENCES "patients"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointments_doctor_date"
        ON "appointments" ("doctor_id", "date")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointments_patient_doctor_date"
        ON "appointments" ("patient_id", "doctor_id", "date")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_appointments_wave_token"
        ON "appointments" ("doctor_id", "date", "tokenNumber")
        WHERE "appointmentType" = 'WAVE' AND "tokenNumber" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_appointments_wave_token"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_appointments_patient_doctor_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_appointments_doctor_date"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "appointments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_schedule_configs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "appointments_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "appointments_appointmenttype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "doctor_schedule_configs_schedulingtype_enum"`,
    );
  }
}
