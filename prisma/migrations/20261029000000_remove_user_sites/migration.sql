-- DropForeignKey
ALTER TABLE "public"."user_sites" DROP CONSTRAINT "user_sites_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_sites" DROP CONSTRAINT "user_sites_site_id_fkey";

-- DropTable
DROP TABLE "public"."user_sites";
