/*
  Warnings:

  - The `version` column on the `miners` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "miners" DROP COLUMN "version",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
