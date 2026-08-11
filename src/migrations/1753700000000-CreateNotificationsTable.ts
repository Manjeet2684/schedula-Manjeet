import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1753700000000
  implements MigrationInterface
{
  name = 'CreateNotificationsTable1753700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notifications_type_enum" AS ENUM (
          'APPOINTMENT_BOOKED',
          'APPOINTMENT_CANCELLED',
          'APPOINTMENT_RESCHEDULED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "patient_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "type" "notifications_type_enum" NOT NULL,
        "title" character varying NOT NULL,
        "message" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_patient_id" FOREIGN KEY ("patient_id")
          REFERENCES "patients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notifications_appointment_id" FOREIGN KEY ("appointment_id")
          REFERENCES "appointments"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_notifications_appointment_id_type"
          UNIQUE ("appointment_id", "type")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_patient_id_created_at"
        ON "notifications" ("patient_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notifications_patient_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
  }
}
