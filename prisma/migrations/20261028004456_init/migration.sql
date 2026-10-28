-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('DEPLOYMENT_SLOT', 'PALLET', 'STAGING', 'REPAIR');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('INITIAL_REGISTRATION', 'DEPLOYMENT', 'READY_FOR_DEPLOYMENT', 'REPAIR', 'RELOCATION');

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" SERIAL NOT NULL,
    "site_id" INTEGER NOT NULL,
    "building_number" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "can" (
    "id" SERIAL NOT NULL,
    "building_id" INTEGER NOT NULL,
    "can_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "row_count" INTEGER NOT NULL,
    "slot_per_row" INTEGER NOT NULL,

    CONSTRAINT "can_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "site_id" INTEGER NOT NULL,
    "building_id" INTEGER NOT NULL,
    "can_id" INTEGER NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "row_index" INTEGER,
    "slot_index" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miner_model" (
    "id" SERIAL NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" TEXT,

    CONSTRAINT "miner_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miners" (
    "id" SERIAL NOT NULL,
    "serial_number" TEXT NOT NULL,
    "asset_tag" TEXT,
    "model_id" INTEGER,
    "owner_company_id" INTEGER NOT NULL,
    "management_company_id" INTEGER NOT NULL,
    "current_location_id" INTEGER,
    "occupied_slot_id" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'TECHNICIAN',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sites" (
    "user_id" INTEGER NOT NULL,
    "site_id" INTEGER NOT NULL,

    CONSTRAINT "user_sites_pkey" PRIMARY KEY ("user_id","site_id")
);

-- CreateTable
CREATE TABLE "miner_movements" (
    "id" SERIAL NOT NULL,
    "miner_id" INTEGER NOT NULL,
    "recorded_by_id" INTEGER NOT NULL,
    "from_location_id" INTEGER,
    "to_location_id" INTEGER NOT NULL,
    "reason" "MovementReason" NOT NULL,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submission_key" UUID NOT NULL,

    CONSTRAINT "miner_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "details" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buildings_site_id_building_number_key" ON "buildings"("site_id", "building_number");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_id_site_id_key" ON "buildings"("id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "can_building_id_can_number_key" ON "can"("building_id", "can_number");

-- CreateIndex
CREATE UNIQUE INDEX "can_id_building_id_key" ON "can"("id", "building_id");

-- CreateIndex
CREATE INDEX "locations_site_id_kind_is_active_idx" ON "locations"("site_id", "kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "locations_site_id_code_key" ON "locations"("site_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_can_id_row_index_slot_index_key" ON "locations"("can_id", "row_index", "slot_index");

-- CreateIndex
CREATE UNIQUE INDEX "miners_serial_number_key" ON "miners"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "miners_occupied_slot_id_key" ON "miners"("occupied_slot_id");

-- CreateIndex
CREATE INDEX "miners_current_location_id_idx" ON "miners"("current_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_sites_site_id_idx" ON "user_sites"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "miner_movements_submission_key_key" ON "miner_movements"("submission_key");

-- CreateIndex
CREATE INDEX "miner_movements_miner_id_occurred_at_id_idx" ON "miner_movements"("miner_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "miner_movements_recorded_at_id_idx" ON "miner_movements"("recorded_at", "id");

-- CreateIndex
CREATE INDEX "miner_movements_from_location_id_idx" ON "miner_movements"("from_location_id");

-- CreateIndex
CREATE INDEX "miner_movements_to_location_id_idx" ON "miner_movements"("to_location_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "can" ADD CONSTRAINT "can_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_building_id_site_id_fkey" FOREIGN KEY ("building_id", "site_id") REFERENCES "buildings"("id", "site_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_can_id_building_id_fkey" FOREIGN KEY ("can_id", "building_id") REFERENCES "can"("id", "building_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "miner_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_owner_company_id_fkey" FOREIGN KEY ("owner_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_management_company_id_fkey" FOREIGN KEY ("management_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miners" ADD CONSTRAINT "miners_occupied_slot_id_fkey" FOREIGN KEY ("occupied_slot_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sites" ADD CONSTRAINT "user_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_movements" ADD CONSTRAINT "miner_movements_miner_id_fkey" FOREIGN KEY ("miner_id") REFERENCES "miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_movements" ADD CONSTRAINT "miner_movements_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_movements" ADD CONSTRAINT "miner_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miner_movements" ADD CONSTRAINT "miner_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
