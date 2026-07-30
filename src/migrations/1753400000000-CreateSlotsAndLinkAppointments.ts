import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSlotsAndLinkAppointments1753400000000
  implements MigrationInterface
{
  name = 'CreateSlotsAndLinkAppointments1753400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "date" date NOT NULL,
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "isBooked" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_slots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_slots_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_slots_doctor_date_start_end"
          UNIQUE ("doctor_id", "date", "startTime", "endTime")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_slots_doctor_date"
        ON "slots" ("doctor_id", "date")
    `);

    await queryRunner.query(`
      ALTER TABLE "appointments"
        ADD COLUMN IF NOT EXISTS "slot_id" uuid
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "appointments"
          ADD CONSTRAINT "FK_appointments_slot_id"
          FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_appointments_active_slot"
        ON "appointments" ("slot_id")
        WHERE "slot_id" IS NOT NULL AND "status" = 'BOOKED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_appointments_active_slot"`,
    );
    await queryRunner.query(`
      ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_slot_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments" DROP COLUMN IF EXISTS "slot_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_slots_doctor_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "slots"`);
  }
}
