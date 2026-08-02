import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAvailabilityTables1753200000000
  implements MigrationInterface
{
  name = 'CreateAvailabilityTables1753200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "recurring_availability_dayofweek_enum" AS ENUM (
          'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recurring_availability" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "dayOfWeek" "recurring_availability_dayofweek_enum" NOT NULL,
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "slotDuration" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recurring_availability_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recurring_availability_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recurring_availability_doctor_id"
        ON "recurring_availability" ("doctor_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recurring_availability_doctor_day"
        ON "recurring_availability" ("doctor_id", "dayOfWeek")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "custom_availability" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_id" uuid NOT NULL,
        "date" date NOT NULL,
        "startTime" TIME NOT NULL,
        "endTime" TIME NOT NULL,
        "isUnavailable" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_custom_availability_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_custom_availability_doctor_id" FOREIGN KEY ("doctor_id")
          REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_custom_availability_doctor_id"
        ON "custom_availability" ("doctor_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_custom_availability_doctor_date"
        ON "custom_availability" ("doctor_id", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_custom_availability_doctor_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_custom_availability_doctor_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_availability"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_recurring_availability_doctor_day"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_recurring_availability_doctor_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_availability"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "recurring_availability_dayofweek_enum"`,
    );
  }
}
