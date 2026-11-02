/*
  Warnings:

  - Added the required column `firmware_version` to the `control_boards` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "control_boards" ADD COLUMN     "firmware_version" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "miners" ADD COLUMN     "last_api_ip" TEXT,
ADD COLUMN     "miner_ip" TEXT;
