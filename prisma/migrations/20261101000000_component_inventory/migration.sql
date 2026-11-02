BEGIN;
-- CreateEnum
CREATE TYPE "HashboardPosition" AS ENUM ('SLOT_1', 'SLOT_2', 'SLOT_3');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'NETWORK', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConditionKind" AS ENUM ('UNKNOWN', 'GOOD', 'FAULTY', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "MinerHistoryKind" AS ENUM ('INITIAL_STATE', 'COMPONENT_INSTALLED', 'COMPONENT_REMOVED', 'COMPONENT_UPDATED', 'MOVEMENT');

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "building_id" DROP NOT NULL,
ALTER COLUMN "can_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "miners" ADD COLUMN     "identify_miner_id" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "miner_movements" ADD COLUMN     "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "recorded_by_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "skeleton" (
    "id" SERIAL NOT NULL,
    "miner_id" INTEGER,
    "serial_number" TEXT NOT NULL,
    "condition" "ConditionKind" NOT NULL DEFAULT 'UNKNOWN',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skeleton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_boards" (
    "id" SERIAL NOT NULL,
    "miner_id" INTEGER,
    "serial_number" TEXT,
    "mac_address" TEXT NOT NULL,
    "condition" "ConditionKind" NOT NULL DEFAULT 'UNKNOWN',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hash_boards" (
    "id" SERIAL NOT NULL,
    "miner_id" INTEGER,
    "position" "HashboardPosition",
    "serial_number" TEXT,
    "condition" "ConditionKind" NOT NULL DEFAULT 'UNKNOWN',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hash_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_switches" (
    "id" TEXT NOT NULL,
    "site_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "network_switches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "port_index" (
    "id" SERIAL NOT NULL,
    "switch_id" TEXT NOT NULL,
    "port_number" TEXT NOT NULL,
    "location_id" INTEGER NOT NULL,
    "observed_mac" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reserved_miner_id" INTEGER,

    CONSTRAINT "port_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miner_history" (
    "id" SERIAL NOT NULL,
    "miner_id" INTEGER NOT NULL,
    "kind" "MinerHistoryKind" NOT NULL,
    "user_id" INTEGER,
    "source" "RecordSource" NOT NULL DEFAULT 'SYSTEM',
    "skeleton_id" INTEGER,
    "control_board_id" INTEGER,
    "hash_board_id" INTEGER,
    "position" "HashboardPosition",
    "movement_id" INTEGER,
    "notes" TEXT,
    "details" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateDeleted" TIMESTAMP(3),

    CONSTRAINT "miner_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skeleton_miner_id_key" ON "skeleton"("miner_id");

-- CreateIndex
CREATE UNIQUE INDEX "skeleton_serial_number_key" ON "skeleton"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "control_boards_miner_id_key" ON "control_boards"("miner_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_boards_serial_number_key" ON "control_boards"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "control_boards_mac_address_key" ON "control_boards"("mac_address");

-- CreateIndex
CREATE UNIQUE INDEX "hash_boards_serial_number_key" ON "hash_boards"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "hash_boards_miner_id_position_key" ON "hash_boards"("miner_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "network_switches_site_id_name_key" ON "network_switches"("site_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "port_index_location_id_key" ON "port_index"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "port_index_reserved_miner_id_key" ON "port_index"("reserved_miner_id");

-- CreateIndex
CREATE INDEX "port_index_observed_mac_idx" ON "port_index"("observed_mac");

-- CreateIndex
CREATE UNIQUE INDEX "port_index_switch_id_port_number_key" ON "port_index"("switch_id", "port_number");

-- CreateIndex
CREATE UNIQUE INDEX "miner_history_movement_id_key" ON "miner_history"("movement_id");

-- CreateIndex
CREATE INDEX "miner_history_miner_id_occurred_at_id_idx" ON "miner_history"("miner_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "miner_history_user_id_idx" ON "miner_history"("user_id");

-- CreateIndex
CREATE INDEX "miner_history_skeleton_id_idx" ON "miner_history"("skeleton_id");

-- CreateIndex
CREATE INDEX "miner_history_control_board_id_idx" ON "miner_history"("control_board_id");

-- CreateIndex
CREATE INDEX "miner_history_hash_board_id_idx" ON "miner_history"("hash_board_id");

-- CreateIndex
CREATE UNIQUE INDEX "miners_identify_miner_id_key" ON "miners"("identify_miner_id");

-- CreateIndex
CREATE INDEX "miners_owner_company_id_idx" ON "miners"("owner_company_id");

-- CreateIndex
CREATE INDEX "miners_management_company_id_idx" ON "miners"("management_company_id");

-- AddForeignKey
ALTER TABLE "skeleton" ADD CONSTRAINT "skeleton_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_boards" ADD CONSTRAINT "control_boards_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hash_boards" ADD CONSTRAINT "hash_boards_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_switches" ADD CONSTRAINT "network_switches_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "port_index" ADD CONSTRAINT "port_index_switch_id_fkey" FOREIGN KEY ("switch_id") REFERENCES "network_switches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "port_index" ADD CONSTRAINT "port_index_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "port_index" ADD CONSTRAINT "port_index_reserved_miner_id_fkey" FOREIGN KEY ("reserved_miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_skeleton_id_fkey" FOREIGN KEY ("skeleton_id") REFERENCES "skeleton"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_control_board_id_fkey" FOREIGN KEY ("control_board_id") REFERENCES "control_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_hash_board_id_fkey" FOREIGN KEY ("hash_board_id") REFERENCES "hash_boards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_history" ADD CONSTRAINT "miner_history_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "miner_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep this migration atomic, including backfill and custom invariants.
-- The file is wrapped in BEGIN/COMMIT by the assembly step.

-- Old miner serial numbers described the physical enclosure. Preserve both the
-- legacy label and a separately tracked skeleton; never fabricate board IDs/MACs.
INSERT INTO "skeleton" ("miner_id", "serial_number", "dateCreated", "dateUpdated")
SELECT "id", "serial_number", "created_at", "updated_at" FROM "miners";

INSERT INTO "miner_history" ("miner_id", "kind", "source", "details")
SELECT m.id, 'INITIAL_STATE', 'IMPORT',
  jsonb_build_object('miner', to_jsonb(m), 'skeleton', to_jsonb(s))
FROM "miners" m JOIN "skeleton" s ON s.miner_id = m.id;

ALTER TABLE "skeleton" ADD CONSTRAINT "skeleton_serial_not_blank"
  CHECK (length(btrim(serial_number)) > 0);
ALTER TABLE "control_boards" ADD CONSTRAINT "control_board_serial_not_blank"
  CHECK (serial_number IS NULL OR length(btrim(serial_number)) > 0);
ALTER TABLE "hash_boards" ADD CONSTRAINT "hash_board_serial_not_blank"
  CHECK (serial_number IS NULL OR length(btrim(serial_number)) > 0);
ALTER TABLE "hash_boards" ADD CONSTRAINT "hash_board_installation_position"
  CHECK ((miner_id IS NULL) = (position IS NULL));
ALTER TABLE "skeleton" ADD CONSTRAINT "skeleton_scrapped_unassigned"
  CHECK (condition <> 'SCRAPPED' OR miner_id IS NULL);
ALTER TABLE "control_boards" ADD CONSTRAINT "control_board_scrapped_unassigned"
  CHECK (condition <> 'SCRAPPED' OR miner_id IS NULL);
ALTER TABLE "hash_boards" ADD CONSTRAINT "hash_board_scrapped_unassigned"
  CHECK (condition <> 'SCRAPPED' OR miner_id IS NULL);
ALTER TABLE "miners" ADD CONSTRAINT "miner_serial_not_blank"
  CHECK (length(btrim(serial_number)) > 0);
ALTER TABLE "locations" ADD CONSTRAINT "location_can_requires_building"
  CHECK (can_id IS NULL OR building_id IS NOT NULL);
ALTER TABLE "locations" ADD CONSTRAINT "deployment_coordinates"
  CHECK (kind <> 'DEPLOYMENT_SLOT' OR
    (building_id IS NOT NULL AND can_id IS NOT NULL AND
     row_index IS NOT NULL AND row_index >= 0 AND slot_index IS NOT NULL AND slot_index >= 0));
ALTER TABLE "miner_movements" ADD CONSTRAINT "manual_movement_requires_actor"
  CHECK (source <> 'MANUAL' OR recorded_by_id IS NOT NULL);
ALTER TABLE "port_index" ADD CONSTRAINT "observed_mac_requires_timestamp"
  CHECK (observed_mac IS NULL OR last_seen_at IS NOT NULL);
ALTER TABLE "port_index" ADD CONSTRAINT "port_number_not_blank"
  CHECK (length(btrim(port_number)) > 0);

-- Normalize equivalent MAC spellings before the board's unique index sees them.
CREATE FUNCTION atlas_normalize_mac(value TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE compact TEXT;
BEGIN
  compact := lower(regexp_replace(value, '[:.\s-]', '', 'g'));
  IF compact !~ '^[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid MAC address: %', value USING ERRCODE = '23514';
  END IF;
  RETURN substring(compact,1,2)||':'||substring(compact,3,2)||':'||
    substring(compact,5,2)||':'||substring(compact,7,2)||':'||
    substring(compact,9,2)||':'||substring(compact,11,2);
END $$;

CREATE FUNCTION atlas_prepare_component() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize changes to an assembly. When moving a component between miners,
  -- acquire both locks in ID order to avoid reciprocal-transfer deadlocks.
  IF TG_OP = 'UPDATE' THEN
    PERFORM id FROM miners WHERE id IN (OLD.miner_id, NEW.miner_id) ORDER BY id FOR UPDATE;
  ELSE
    PERFORM id FROM miners WHERE id = NEW.miner_id FOR UPDATE;
  END IF;
  NEW."dateUpdated" := CURRENT_TIMESTAMP;
  IF TG_TABLE_NAME = 'control_boards' THEN
    NEW.mac_address := atlas_normalize_mac(NEW.mac_address);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER skeleton_prepare BEFORE INSERT OR UPDATE ON skeleton
FOR EACH ROW EXECUTE FUNCTION atlas_prepare_component();
CREATE TRIGGER control_board_prepare BEFORE INSERT OR UPDATE ON control_boards
FOR EACH ROW EXECUTE FUNCTION atlas_prepare_component();
CREATE TRIGGER hash_board_prepare BEFORE INSERT OR UPDATE ON hash_boards
FOR EACH ROW EXECUTE FUNCTION atlas_prepare_component();

CREATE FUNCTION atlas_check_port() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location_site INT; switch_site INT; location_kind "LocationKind";
BEGIN
  SELECT site_id, kind INTO location_site, location_kind FROM locations
    WHERE id = NEW.location_id FOR SHARE;
  SELECT site_id INTO switch_site FROM network_switches WHERE id = NEW.switch_id FOR SHARE;
  IF location_kind <> 'DEPLOYMENT_SLOT' OR location_site <> switch_site THEN
    RAISE EXCEPTION 'A port must map to a deployment slot in its switch site' USING ERRCODE = '23514';
  END IF;
  NEW.observed_mac := atlas_normalize_mac(NEW.observed_mac);
  RETURN NEW;
END $$;
CREATE TRIGGER port_check BEFORE INSERT OR UPDATE ON port_index
FOR EACH ROW EXECUTE FUNCTION atlas_check_port();

CREATE FUNCTION atlas_check_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destination_kind "LocationKind";
BEGIN
  IF NEW.current_location_id IS NOT NULL THEN
    SELECT kind INTO destination_kind FROM locations WHERE id = NEW.current_location_id FOR SHARE;
  END IF;
  IF destination_kind = 'DEPLOYMENT_SLOT' THEN
    IF NEW.occupied_slot_id IS DISTINCT FROM NEW.current_location_id THEN
      RAISE EXCEPTION 'Deployment occupancy must equal current location' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.occupied_slot_id IS NOT NULL THEN
    RAISE EXCEPTION 'Shared or unassigned locations cannot occupy a deployment slot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER miner_occupancy_check BEFORE INSERT OR UPDATE ON miners
FOR EACH ROW EXECUTE FUNCTION atlas_check_occupancy();

-- Do not silently accept inconsistent existing occupancy on migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM miners m LEFT JOIN locations l ON l.id=m.current_location_id
    WHERE (l.kind='DEPLOYMENT_SLOT' AND m.occupied_slot_id IS DISTINCT FROM m.current_location_id)
       OR ((l.kind IS DISTINCT FROM 'DEPLOYMENT_SLOT'::"LocationKind") AND m.occupied_slot_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Resolve existing miner occupancy inconsistencies before migrating';
  END IF;
END $$;

-- Prevent later edits to referenced topology from invalidating the port checks.
CREATE FUNCTION atlas_protect_location_topology() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.kind IS DISTINCT FROM OLD.kind OR NEW.site_id IS DISTINCT FROM OLD.site_id)
    AND (EXISTS (SELECT 1 FROM port_index WHERE location_id=OLD.id)
      OR EXISTS (SELECT 1 FROM miners WHERE current_location_id=OLD.id)) THEN
    RAISE EXCEPTION 'Detach miners and ports before changing location kind/site' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER location_topology_check BEFORE UPDATE ON locations
FOR EACH ROW EXECUTE FUNCTION atlas_protect_location_topology();
CREATE FUNCTION atlas_protect_switch_site() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.site_id IS DISTINCT FROM OLD.site_id AND EXISTS (SELECT 1 FROM port_index WHERE switch_id=OLD.id) THEN
    RAISE EXCEPTION 'Detach ports before changing switch site' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER switch_site_check BEFORE UPDATE ON network_switches
FOR EACH ROW EXECUTE FUNCTION atlas_protect_switch_site();

-- Actor context is transaction-local and must be set by the authenticated server.
-- With no context, automatic/imported changes remain explicitly SYSTEM-owned.
CREATE FUNCTION atlas_component_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous JSONB; current_row JSONB; old_miner INT; new_miner INT;
  target INT; event_kind "MinerHistoryKind"; actor INT; event_source "RecordSource";
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); old_miner := OLD.miner_id; END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); new_miner := NEW.miner_id; END IF;
  -- Changing only the update timestamp is not a component event.
  IF TG_OP = 'UPDATE' AND (previous - 'dateUpdated') = (current_row - 'dateUpdated') THEN RETURN NEW; END IF;
  actor := nullif(current_setting('atlas.actor_id', true), '')::INT;
  event_source := coalesce(nullif(current_setting('atlas.source', true), ''), 'SYSTEM')::"RecordSource";
  IF old_miner IS NOT NULL AND new_miner IS DISTINCT FROM old_miner THEN
    INSERT INTO miner_history (miner_id, kind, user_id, source, skeleton_id, control_board_id, hash_board_id, position, details)
    VALUES (old_miner, 'COMPONENT_REMOVED', actor, event_source,
      CASE WHEN TG_TABLE_NAME='skeleton' THEN OLD.id END,
      CASE WHEN TG_TABLE_NAME='control_boards' THEN OLD.id END,
      CASE WHEN TG_TABLE_NAME='hash_boards' THEN OLD.id END,
      (previous->>'position')::"HashboardPosition", jsonb_build_object('before',previous,'after',current_row));
  END IF;
  IF new_miner IS NOT NULL THEN
    event_kind := CASE WHEN new_miner IS DISTINCT FROM old_miner THEN 'COMPONENT_INSTALLED' ELSE 'COMPONENT_UPDATED' END;
    INSERT INTO miner_history (miner_id, kind, user_id, source, skeleton_id, control_board_id, hash_board_id, position, details)
    VALUES (new_miner, event_kind, actor, event_source,
      CASE WHEN TG_TABLE_NAME='skeleton' THEN NEW.id END,
      CASE WHEN TG_TABLE_NAME='control_boards' THEN NEW.id END,
      CASE WHEN TG_TABLE_NAME='hash_boards' THEN NEW.id END,
      (current_row->>'position')::"HashboardPosition", jsonb_build_object('before',previous,'after',current_row));
  END IF;
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (actor, 'COMPONENT_'||TG_OP, TG_TABLE_NAME, coalesce((current_row->>'id')::INT,(previous->>'id')::INT),
    jsonb_build_object('source',event_source,'before',previous,'after',current_row));
  UPDATE miners SET version=version+1,updated_at=CURRENT_TIMESTAMP
    WHERE id IN (old_miner,new_miner);
  RETURN NEW;
END $$;
-- Components are retained after removal. Historical foreign keys intentionally
-- block deleting a previously installed component; scrap it instead.
CREATE TRIGGER skeleton_history AFTER INSERT OR UPDATE ON skeleton
FOR EACH ROW EXECUTE FUNCTION atlas_component_history();
CREATE TRIGGER control_board_history AFTER INSERT OR UPDATE ON control_boards
FOR EACH ROW EXECUTE FUNCTION atlas_component_history();
CREATE TRIGGER hash_board_history AFTER INSERT OR UPDATE ON hash_boards
FOR EACH ROW EXECUTE FUNCTION atlas_component_history();

CREATE FUNCTION atlas_movement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO miner_history (miner_id, kind, user_id, source, movement_id, notes, occurred_at, details)
  VALUES (NEW.miner_id, 'MOVEMENT', NEW.recorded_by_id, NEW.source, NEW.id, NEW.notes, NEW.occurred_at, to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER movement_history AFTER INSERT ON miner_movements
FOR EACH ROW EXECUTE FUNCTION atlas_movement_history();

-- Enforce the registration requirement at transaction completion so a nested
-- miner+skeleton creation is possible. Repairs may later remove the skeleton.
CREATE FUNCTION atlas_registration_skeleton() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM miners WHERE id=NEW.id)
    AND NOT EXISTS (SELECT 1 FROM skeleton WHERE miner_id=NEW.id) THEN
    RAISE EXCEPTION 'Register a miner with a skeleton and nonblank serial number' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER miner_registration_skeleton AFTER INSERT ON miners
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atlas_registration_skeleton();

COMMIT;
