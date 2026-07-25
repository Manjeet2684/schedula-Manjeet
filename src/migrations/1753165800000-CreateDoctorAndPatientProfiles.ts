import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDoctorAndPatientProfiles1753165800000
  implements MigrationInterface
{
  name = 'CreateDoctorAndPatientProfiles1753165800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "doctors" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "fullName" character varying NOT NULL,
        "specialization" character varying NOT NULL,
        "experience" integer NOT NULL,
        "qualification" character varying NOT NULL,
        "consultationFee" numeric(10,2) NOT NULL,
        "availability" text NOT NULL,
        "profileDetails" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_doctors_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_doctors_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doctors_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "fullName" character varying NOT NULL,
        "age" integer NOT NULL,
        "gender" character varying NOT NULL,
        "contactDetails" character varying NOT NULL,
        "healthInformation" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_patients_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_patients_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_patients_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctors"`);
  }
}
