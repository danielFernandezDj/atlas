import assert from "node:assert/strict"
import test from "node:test"
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"

const root =
  process.env.ATLAS_SCHEMA_TEST_ROOT ??
  fileURLToPath(new URL("../", import.meta.url))
const migrationName = "20261101000000_component_inventory"
const originalFixture = `
  INSERT INTO companies (id,name) VALUES (1,'Owner'),(2,'Manager');
  INSERT INTO sites (id,name) VALUES (1,'A'),(2,'B');
  INSERT INTO buildings (id,site_id,building_number) VALUES (1,1,1),(2,2,1);
  INSERT INTO can (id,building_id,can_number,row_count,slot_per_row) VALUES (1,1,'1',10,35),(2,2,'1',10,35);
  INSERT INTO locations (id,site_id,building_id,can_id,kind,code,name,row_index,slot_index) VALUES
    (1,1,1,1,'DEPLOYMENT_SLOT','A-1','Slot 1',1,1),
    (2,1,1,1,'DEPLOYMENT_SLOT','A-2','Slot 2',1,2),
    (3,1,1,1,'REPAIR','REPAIR','Repair',NULL,NULL),
    (4,2,2,2,'DEPLOYMENT_SLOT','B-1','Other site',1,1);
  INSERT INTO users (id,first_name,last_name,email) VALUES (1,'Test','Technician','tech@example.test');
  INSERT INTO miner_model (id,manufacturer,name) VALUES (1,'Test','Three board miner');
  INSERT INTO miners (id,serial_number,model_id,owner_company_id,management_company_id,current_location_id,occupied_slot_id,updated_at)
    VALUES (10,'ENCLOSURE-10',1,1,2,1,1,'2026-10-01');
  INSERT INTO miner_movements (miner_id,recorded_by_id,to_location_id,reason,submission_key)
    VALUES (10,1,1,'INITIAL_REGISTRATION','00000000-0000-4000-8000-000000000001');
  SELECT setval(pg_get_serial_sequence('locations','id'),4);
  SELECT setval(pg_get_serial_sequence('miners','id'),10);
`

test(
  "component architecture migration and database invariants",
  { timeout: 120000 },
  async (t) => {
    const db = new PGlite()
    await db.waitReady
    const query = (sql, args) => db.query(sql, args)
    const rejects = (sql, pattern) => assert.rejects(query(sql), pattern)
    try {
      const migrations = (await readdir(join(root, "prisma/migrations")))
        .filter((name) => name < migrationName && /^\d/.test(name))
        .sort()
      for (const name of migrations) {
        await db.exec(
          await readFile(
            join(root, "prisma/migrations", name, "migration.sql"),
            "utf8"
          )
        )
      }
      await db.exec(originalFixture)
      await db.exec(
        await readFile(
          join(root, "prisma/migrations", migrationName, "migration.sql"),
          "utf8"
        )
      )

      // Exercise the full chain, including migrations added after inventory.
      for (const name of (await readdir(join(root, "prisma/migrations")))
        .filter((name) => /^\d/.test(name) && name > migrationName)
        .sort()) {
        await db.exec(
          await readFile(
            join(root, "prisma/migrations", name, "migration.sql"),
            "utf8"
          )
        )
      }

      await t.test(
        "existing assets, ownership, timestamps and movements survive",
        async () => {
          const { rows } =
            await query(`SELECT m.id,m.serial_number,m.owner_company_id,m.management_company_id,m.version,
        s.serial_number AS skeleton_serial, (SELECT count(*)::int FROM miner_movements) AS moves
        FROM miners m JOIN skeleton s ON s.miner_id=m.id WHERE m.id=10`)
          assert.deepEqual(rows[0], {
            id: 10,
            serial_number: "ENCLOSURE-10",
            owner_company_id: 1,
            management_company_id: 2,
            version: 0,
            skeleton_serial: "ENCLOSURE-10",
            moves: 1,
          })
          assert.equal(
            (await query(`SELECT kind FROM miner_history WHERE miner_id=10`))
              .rows[0].kind,
            "INITIAL_STATE"
          )
          assert.equal(
            (
              await query(
                `SELECT extract(year from updated_at)::int AS year FROM miners WHERE id=10`
              )
            ).rows[0].year,
            2026
          )
        }
      )

      await t.test(
        "two and three hashboards occupy distinct positions; duplicate/fourth assignments fail",
        async () => {
          await db.exec(`INSERT INTO hash_boards (miner_id,position,serial_number,"dateUpdated") VALUES
        (10,'SLOT_1','HB-1',now()),(10,'SLOT_2','HB-2',now());`)
          assert.equal(
            (
              await query(
                `SELECT count(*)::int AS n FROM hash_boards WHERE miner_id=10`
              )
            ).rows[0].n,
            2
          )
          assert.equal(
            (await query(`SELECT version FROM miners WHERE id=10`)).rows[0]
              .version,
            2
          )
          await query(
            `INSERT INTO hash_boards (miner_id,position,serial_number,"dateUpdated") VALUES (10,'SLOT_3','HB-3',now())`
          )
          assert.equal(
            (
              await query(
                `SELECT count(*)::int AS n FROM hash_boards WHERE miner_id=10`
              )
            ).rows[0].n,
            3
          )
          await rejects(
            `INSERT INTO hash_boards (miner_id,position,"dateUpdated") VALUES (10,'SLOT_1',now())`,
            /unique/i
          )
          await rejects(
            `INSERT INTO hash_boards (miner_id,position,"dateUpdated") VALUES (10,'SLOT_4',now())`,
            /enum/i
          )
          await rejects(
            `INSERT INTO hash_boards (miner_id,"dateUpdated") VALUES (10,now())`,
            /hash_board_installation_position/
          )
          await rejects(
            `INSERT INTO hash_boards (position,"dateUpdated") VALUES ('SLOT_1',now())`,
            /hash_board_installation_position/
          )
          await rejects(
            `INSERT INTO hash_boards (miner_id,position,"dateUpdated") VALUES (999,'SLOT_1',now())`,
            /foreign key/i
          )
        }
      )

      await t.test(
        "removing and replacing a board preserves its identity, position and actor history",
        async () => {
          await db.exec(`BEGIN;
        SELECT set_config('atlas.actor_id','1',true), set_config('atlas.source','MANUAL',true);
        UPDATE hash_boards SET miner_id=NULL,position=NULL,condition='FAULTY' WHERE serial_number='HB-2';
        INSERT INTO hash_boards (miner_id,position,serial_number,"dateUpdated") VALUES (10,'SLOT_2','HB-REPLACEMENT',now());
        COMMIT;`)
          const { rows } =
            await query(`SELECT kind,user_id,source,position,details FROM miner_history
        WHERE kind='COMPONENT_REMOVED' ORDER BY id DESC LIMIT 1`)
          assert.equal(rows[0].position, "SLOT_2")
          assert.equal(rows[0].user_id, 1)
          assert.equal(rows[0].source, "MANUAL")
          assert.equal(rows[0].details.before.serial_number, "HB-2")
          assert.equal(rows[0].details.after.miner_id, null)
          await rejects(
            `DELETE FROM hash_boards WHERE serial_number='HB-2'`,
            /foreign key/i
          )
          assert.ok(
            (
              await query(
                `SELECT count(*)::int AS n FROM audit_log WHERE entity_type='hash_boards'`
              )
            ).rows[0].n >= 5
          )
        }
      )

      await t.test(
        "control-board MAC normalization prevents equivalent duplicate addresses",
        async () => {
          await query(
            `INSERT INTO control_boards (miner_id,mac_address,"dateUpdated") VALUES (10,'AA-BB-CC-DD-EE-FF',now())`
          )
          assert.equal(
            (
              await query(
                `SELECT mac_address FROM control_boards WHERE miner_id=10`
              )
            ).rows[0].mac_address,
            "aa:bb:cc:dd:ee:ff"
          )
          await rejects(
            `INSERT INTO control_boards (mac_address,"dateUpdated") VALUES ('aabb.ccdd.eeff',now())`,
            /unique/i
          )
          await rejects(
            `INSERT INTO control_boards (mac_address,"dateUpdated") VALUES ('invalid',now())`,
            /Invalid MAC/
          )
          await rejects(
            `INSERT INTO control_boards (miner_id,mac_address,"dateUpdated") VALUES (10,'00:11:22:33:44:55',now())`,
            /unique/i
          )
          await rejects(
            `UPDATE control_boards SET condition='SCRAPPED' WHERE miner_id=10`,
            /scrapped_unassigned/
          )
        }
      )

      await t.test(
        "empty ports, multiple ports per switch, repeated port numbers and stale MAC observations",
        async () => {
          await db.exec(`INSERT INTO network_switches (id,site_id,name) VALUES ('sw-a',1,'A'),('sw-b',2,'B');
        INSERT INTO port_index (switch_id,port_number,location_id,reserved_miner_id) VALUES ('sw-a','1',1,10),('sw-a','2',2,NULL),('sw-b','1',4,NULL);
        UPDATE port_index SET observed_mac='AA-BB-CC-DD-EE-FF',last_seen_at=now() WHERE location_id IN (1,2);`)
          assert.equal(
            (
              await query(
                `SELECT count(*)::int AS n FROM port_index WHERE observed_mac='aa:bb:cc:dd:ee:ff'`
              )
            ).rows[0].n,
            2
          )
          assert.equal(
            (
              await query(
                `SELECT last_seen_at FROM port_index WHERE location_id=4`
              )
            ).rows[0].last_seen_at,
            null
          )
          await rejects(
            `UPDATE port_index SET switch_id='sw-b' WHERE location_id=2`,
            /switch site/
          )
          await rejects(
            `UPDATE port_index SET location_id=3 WHERE location_id=2`,
            /deployment slot/
          )
          await rejects(
            `UPDATE port_index SET last_seen_at=NULL WHERE location_id=1`,
            /observed_mac_requires_timestamp/
          )
          await rejects(
            `UPDATE port_index SET reserved_miner_id=10 WHERE location_id=2`,
            /unique/i
          )
          await rejects(
            `UPDATE network_switches SET site_id=2 WHERE id='sw-a'`,
            /Detach ports/
          )
          await rejects(
            `UPDATE locations SET kind='REPAIR' WHERE id=1`,
            /Detach miners and ports/
          )
        }
      )

      await t.test(
        "repair preserves the reserved port but releases exclusive physical occupancy",
        async () => {
          await rejects(
            `UPDATE miners SET current_location_id=3 WHERE id=10`,
            /Shared or unassigned/
          )
          await query(
            `UPDATE miners SET current_location_id=3,occupied_slot_id=NULL,version=version+1 WHERE id=10`
          )
          assert.equal(
            (
              await query(
                `SELECT reserved_miner_id FROM port_index WHERE location_id=1`
              )
            ).rows[0].reserved_miner_id,
            10
          )
          await rejects(
            `UPDATE miners SET current_location_id=1 WHERE id=10`,
            /occupancy must equal/
          )
          await query(
            `INSERT INTO locations (site_id,kind,code,name) VALUES (1,'REPAIR','OUTSIDE-CAN','Workshop')`
          )
          await rejects(
            `INSERT INTO locations (site_id,can_id,kind,code,name) VALUES (1,1,'REPAIR','BAD','Bad')`,
            /location_can_requires_building/
          )
        }
      )

      await t.test(
        "network movements have no fabricated user and enter miner history",
        async () => {
          await query(`INSERT INTO miner_movements (miner_id,source,to_location_id,reason,submission_key)
        VALUES (10,'NETWORK',3,'REPAIR','00000000-0000-4000-8000-000000000002')`)
          const event = (
            await query(
              `SELECT source,user_id,details FROM miner_history WHERE kind='MOVEMENT'`
            )
          ).rows[0]
          assert.equal(event.source, "NETWORK")
          assert.equal(event.user_id, null)
          assert.equal(event.details.to_location_id, 3)
          await rejects(
            `INSERT INTO miner_movements (miner_id,to_location_id,reason,submission_key)
        VALUES (10,3,'REPAIR','00000000-0000-4000-8000-000000000003')`,
            /manual_movement_requires_actor/
          )
        }
      )

      await t.test(
        "registration requires a nonblank skeleton serial and supports one transaction",
        async () => {
          await rejects(
            `INSERT INTO miners (serial_number,owner_company_id,management_company_id,updated_at)
        VALUES ('NO-SKELETON',1,2,now())`,
            /Register a miner/
          )
          await rejects(
            `INSERT INTO skeleton (serial_number,"dateUpdated") VALUES ('   ',now())`,
            /not_blank/
          )
          await db.exec(`BEGIN;
        INSERT INTO miners (id,serial_number,owner_company_id,management_company_id,updated_at)
          VALUES (20,'ASSET-20',1,2,now());
        INSERT INTO skeleton (miner_id,serial_number,"dateUpdated") VALUES (20,'ENCLOSURE-20',now());
        COMMIT;`)
          assert.equal(
            (await query(`SELECT count(*)::int AS n FROM miners WHERE id=20`))
              .rows[0].n,
            1
          )
          // A board can change owners only by moving its single current assignment.
          await query(
            `UPDATE hash_boards SET miner_id=20 WHERE serial_number='HB-1'`
          )
          assert.equal(
            (
              await query(
                `SELECT miner_id FROM hash_boards WHERE serial_number='HB-1'`
              )
            ).rows[0].miner_id,
            20
          )
          const transfer = (
            await query(
              `SELECT miner_id,kind FROM miner_history WHERE hash_board_id=(SELECT id FROM hash_boards WHERE serial_number='HB-1') ORDER BY id DESC LIMIT 2`
            )
          ).rows
          assert.deepEqual(
            transfer.map((e) => [e.miner_id, e.kind]),
            [
              [20, "COMPONENT_INSTALLED"],
              [10, "COMPONENT_REMOVED"],
            ]
          )
        }
      )
      await t.test(
        "firmware may be unknown or a version label; both IP fields validate IPv4/IPv6",
        async () => {
          assert.equal(
            (
              await query(
                `SELECT firmware_version FROM control_boards WHERE miner_id=10`
              )
            ).rows[0].firmware_version,
            null
          )
          await query(
            `UPDATE control_boards SET firmware_version='24.03-build.2' WHERE miner_id=10`
          )
          assert.equal(
            (
              await query(
                `SELECT firmware_version FROM control_boards WHERE miner_id=10`
              )
            ).rows[0].firmware_version,
            "24.03-build.2"
          )
          assert.equal(
            (
              await query(
                `SELECT details->'after'->>'firmware_version' AS firmware FROM miner_history WHERE control_board_id=(SELECT id FROM control_boards WHERE miner_id=10) ORDER BY id DESC LIMIT 1`
              )
            ).rows[0].firmware,
            "24.03-build.2"
          )
          await query(
            `UPDATE control_boards SET firmware_version=NULL WHERE miner_id=10`
          )
          await query(
            `UPDATE miners SET miner_ip='192.0.2.10',last_api_ip='2001:db8::10' WHERE id=10`
          )
          assert.deepEqual(
            (
              await query(
                `SELECT host(miner_ip) AS miner_ip,host(last_api_ip) AS last_api_ip FROM miners WHERE id=10`
              )
            ).rows[0],
            { miner_ip: "192.0.2.10", last_api_ip: "2001:db8::10" }
          )
          await rejects(
            `UPDATE miners SET miner_ip='not-an-address' WHERE id=10`,
            /inet/
          )
          await rejects(
            `UPDATE miners SET last_api_ip='999.999.999.999' WHERE id=10`,
            /inet/
          )
          await query(
            `UPDATE miners SET miner_ip=NULL,last_api_ip=NULL WHERE id=10`
          )
        }
      )
    } finally {
      await db.close()
    }
  }
)

test(
  "inconsistent old occupancy aborts and rolls back the entire migration",
  { timeout: 120000 },
  async () => {
    const db = new PGlite()
    await db.waitReady
    try {
      const migrations = (await readdir(join(root, "prisma/migrations")))
        .filter((name) => name < migrationName && /^\d/.test(name))
        .sort()
      for (const name of migrations) {
        await db.exec(
          await readFile(
            join(root, "prisma/migrations", name, "migration.sql"),
            "utf8"
          )
        )
      }
      await db.exec(originalFixture)
      await db.exec(`UPDATE miners SET occupied_slot_id=NULL WHERE id=10`)
      const migration = await readFile(
        join(root, "prisma/migrations", migrationName, "migration.sql"),
        "utf8"
      )
      await assert.rejects(db.exec(migration), /occupancy inconsistencies/)
      await db.exec("ROLLBACK")
      assert.equal(
        (await db.query(`SELECT to_regclass('public.skeleton') AS relation`))
          .rows[0].relation,
        null
      )
      assert.equal(
        (await db.query(`SELECT serial_number FROM miners WHERE id=10`)).rows[0]
          .serial_number,
        "ENCLOSURE-10"
      )
      assert.equal(
        (await db.query(`SELECT count(*)::int AS n FROM miner_movements`))
          .rows[0].n,
        1
      )
      assert.equal(
        (
          await db.query(
            `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='miners' AND column_name='identify_miner_id'`
          )
        ).rows[0].n,
        0
      )
    } finally {
      await db.close()
    }
  }
)

test(
  "firmware/IP correction preserves populated data and rolls back invalid IPs",
  { timeout: 120000 },
  async () => {
    const db = new PGlite()
    await db.waitReady
    const correction = "20261102033300_optional_firmware_and_inet_addresses"
    try {
      for (const name of (await readdir(join(root, "prisma/migrations")))
        .filter((name) => /^\d/.test(name) && name < correction)
        .sort()) {
        if (name === migrationName) await db.exec(originalFixture)
        await db.exec(
          await readFile(
            join(root, "prisma/migrations", name, "migration.sql"),
            "utf8"
          )
        )
      }
      await db.exec(`INSERT INTO control_boards (miner_id,mac_address,firmware_version,"dateUpdated") VALUES (10,'AA:BB:CC:DD:EE:FF',42,now());
      UPDATE miners SET miner_ip='not-an-address',last_api_ip='2001:db8::1' WHERE id=10;`)
      const migration = await readFile(
        join(root, "prisma/migrations", correction, "migration.sql"),
        "utf8"
      )
      await assert.rejects(db.exec(migration), /inet/)
      await db.exec("ROLLBACK")
      assert.equal(
        (
          await db.query(
            `SELECT firmware_version FROM control_boards WHERE miner_id=10`
          )
        ).rows[0].firmware_version,
        42
      )
      assert.equal(
        (await db.query(`SELECT miner_ip FROM miners WHERE id=10`)).rows[0]
          .miner_ip,
        "not-an-address"
      )
      await db.exec(
        `UPDATE miners SET miner_ip='192.0.2.1',last_api_ip='2001:db8::1' WHERE id=10`
      )
      await db.exec(migration)
      assert.equal(
        (
          await db.query(
            `SELECT firmware_version FROM control_boards WHERE miner_id=10`
          )
        ).rows[0].firmware_version,
        "42"
      )
      assert.deepEqual(
        (
          await db.query(
            `SELECT host(miner_ip) AS miner_ip,host(last_api_ip) AS last_api_ip FROM miners WHERE id=10`
          )
        ).rows[0],
        { miner_ip: "192.0.2.1", last_api_ip: "2001:db8::1" }
      )
    } finally {
      await db.close()
    }
  }
)
