import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRescheduleNeededStatus1753600000000
  implements MigrationInterface
{
  name = 'AddRescheduleNeededStatus1753600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "appointments_status_enum" ADD VALUE IF NOT EXISTS 'RESCHEDULE_NEEDED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL cannot drop a single enum value safely without rewriting the type.
    await queryRunner.query(`SELECT 1`);
  }
}
