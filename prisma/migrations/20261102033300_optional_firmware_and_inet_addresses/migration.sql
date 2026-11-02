-- Preserve existing values: Prisma's generated text-to-inet diff drops columns.
-- Invalid nonblank addresses abort the transaction for correction, rather than
-- deleting or silently replacing data. Empty/whitespace-only addresses mean unknown.
BEGIN;

ALTER TABLE "miners"
  ALTER COLUMN "miner_ip" TYPE INET USING NULLIF(btrim("miner_ip"), '')::INET,
  ALTER COLUMN "last_api_ip" TYPE INET USING NULLIF(btrim("last_api_ip"), '')::INET;

ALTER TABLE "control_boards"
  ALTER COLUMN "firmware_version" DROP NOT NULL,
  ALTER COLUMN "firmware_version" TYPE TEXT USING "firmware_version"::TEXT;

COMMIT;
