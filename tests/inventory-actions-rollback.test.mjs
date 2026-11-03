import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"
test(
  "inventory write workflow against Neon, with every write rolled back",
  { skip: process.env.ATLAS_ACTIONS_ROLLBACK_TEST !== "1", timeout: 120000 },
  async () => {
    const root = fileURLToPath(new URL("../", import.meta.url)).replace(
      /\/$/,
      ""
    )
    const require = createRequire(root + "/package.json")
    require("dotenv").config({ path: root + "/.env", quiet: true })
    const ts = require("typescript"),
      uri = (s) =>
        `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`
    const compile = async (p) =>
      ts
        .transpileModule(await readFile(root + "/" + p, "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        })
        .outputText.replace('import "server-only";', "")
    const contracts = uri(
      (await compile("lib/inventory-actions/contracts.ts")).replace(
        '"zod"',
        JSON.stringify(pathToFileURL(require.resolve("zod")).href)
      )
    )
    const reader = uri(
      (await compile("lib/inventory-actions/read.ts")).replace(
        '"./contracts"',
        JSON.stringify(contracts)
      )
    )
    const writer = uri(
      (await compile("lib/inventory-actions/write.ts"))
        .replace('"./contracts"', JSON.stringify(contracts))
        .replace('"./read"', JSON.stringify(reader))
    )
    const { performInventoryAction } = await import(writer)
    const { PrismaClient } = await import(
      pathToFileURL(root + "/lib/generated/prisma/client.ts").href
    )
    const { PrismaNeon } = require("@prisma/adapter-neon")
    const db = new PrismaClient({
      adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
    })
    const serial = "ATLAS-ROLLBACK-" + crypto.randomUUID()
    const marker = "ATLAS_ACTION_ROLLBACK_COMPLETE"
    let completed = false
    try {
      await db.$transaction(
        async (tx) => {
          const actor = await tx.users.findFirst({
            where: {
              is_active: true,
              role: { in: ["ADMIN", "MANAGER", "TECHNICIAN"] },
            },
            select: { id: true },
          })
          const company = await tx.companies.findFirst({ select: { id: true } })
          const shared = await tx.locations.findFirst({
            where: {
              kind: "REPAIR",
              is_active: true,
              site: { is_active: true },
            },
            select: { id: true },
          })
          const port = await tx.port_index.findFirst({
            where: {
              active: true,
              reserved_miner_id: null,
              switch: { active: true },
              location: {
                is_active: true,
                kind: "DEPLOYMENT_SLOT",
                site: { is_active: true },
                building: { is_active: true },
                can: { is_active: true },
                current_miners: { none: {} },
                slot_occupant: null,
              },
            },
            select: { id: true, location_id: true },
          })
          assert.ok(
            actor && company && shared && port,
            "Need active staff, company, repair location and empty port"
          )
          const wrap = { $transaction: (fn) => fn(tx) }
          const command = {
            kind: "create",
            skeletonSerial: serial,
            locationId: shared.id,
            ownerId: company.id,
            managerId: company.id,
            modelId: null,
            assetTag: null,
            notes: "Rolled-back integration validation",
            submissionKey: crypto.randomUUID(),
          }
          const made = await performInventoryAction(wrap, actor.id, command)
          const replay = await performInventoryAction(wrap, actor.id, command)
          assert.equal(replay.minerId, made.minerId)
          assert.equal(
            await tx.miner_movements.count({
              where: { miner_id: made.minerId },
            }),
            1
          )
          let miner = await tx.miner.findUniqueOrThrow({
            where: { id: made.minerId },
          })
          assert.ok(
            await tx.skeleton.findUnique({ where: { miner_id: miner.id } })
          )
          await performInventoryAction(wrap, actor.id, {
            kind: "move",
            minerId: miner.id,
            version: miner.version,
            locationId: port.location_id,
            notes: "Rolled-back deploy validation",
            submissionKey: crypto.randomUUID(),
          })
          miner = await tx.miner.findUniqueOrThrow({ where: { id: miner.id } })
          assert.equal(miner.occupied_slot_id, port.location_id)
          assert.equal(
            (await tx.port_index.findUniqueOrThrow({ where: { id: port.id } }))
              .reserved_miner_id,
            miner.id
          )
          await assert.rejects(
            performInventoryAction(wrap, actor.id, {
              ...command,
              skeletonSerial: serial + "-OTHER",
              locationId: port.location_id,
              submissionKey: crypto.randomUUID(),
            }),
            /reserved|occupies/
          )
          await assert.rejects(
            performInventoryAction(wrap, actor.id, {
              kind: "move",
              minerId: miner.id,
              version: miner.version - 1,
              locationId: shared.id,
              notes: "Stale version validation",
              submissionKey: crypto.randomUUID(),
            }),
            /changed/
          )
          const edit = {
            kind: "edit",
            minerId: miner.id,
            version: miner.version,
            ownerId: company.id,
            managerId: company.id,
            modelId: null,
            assetTag: "ROLLBACK-CHECK",
            notes: "Rolled-back metadata validation",
            submissionKey: crypto.randomUUID(),
          }
          await performInventoryAction(wrap, actor.id, edit)
          await performInventoryAction(wrap, actor.id, edit)
          miner = await tx.miner.findUniqueOrThrow({ where: { id: miner.id } })
          assert.equal(miner.asset_tag, "ROLLBACK-CHECK")
          await performInventoryAction(wrap, actor.id, {
            kind: "move",
            minerId: miner.id,
            version: miner.version,
            locationId: shared.id,
            notes: "Rolled-back repair validation",
            submissionKey: crypto.randomUUID(),
          })
          assert.equal(
            (await tx.port_index.findUniqueOrThrow({ where: { id: port.id } }))
              .reserved_miner_id,
            miner.id
          )
          assert.equal(
            (await tx.miner.findUniqueOrThrow({ where: { id: miner.id } }))
              .occupied_slot_id,
            null
          )
          assert.equal(
            await tx.miner_movements.count({ where: { miner_id: miner.id } }),
            3
          )
          assert.equal(
            await tx.miner_history.count({
              where: {
                miner_id: miner.id,
                kind: "MOVEMENT",
                user_id: actor.id,
              },
            }),
            3
          )
          assert.equal(
            await tx.audit_log.count({
              where: {
                user_id: actor.id,
                entity_type: "miners",
                entity_id: miner.id,
              },
            }),
            4
          )
          completed = true
          throw new Error(marker)
        },
        { isolationLevel: "Serializable", timeout: 60000 }
      )
    } catch (error) {
      if (error.message !== marker) throw error
    } finally {
      if (completed) {
        assert.equal(
          await db.miner.count({ where: { serial_number: serial } }),
          0
        )
        console.log(
          JSON.stringify({
            create: true,
            idempotentRetries: true,
            deploy: true,
            repairReservation: true,
            metadata: true,
            history: true,
            audit: true,
            staleEditBlocked: true,
            occupiedPortBlocked: true,
            allTestWritesRolledBack: true,
          })
        )
      }
      await db.$disconnect()
    }
  }
)
