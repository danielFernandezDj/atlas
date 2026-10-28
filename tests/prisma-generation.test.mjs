import assert from "node:assert/strict"
import test from "node:test"
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  access,
  rm,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
const exec = promisify(execFile)
const root = fileURLToPath(new URL("../", import.meta.url))
test(
  "a clean checkout generates the exact Prisma Client entry point used by the app",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "atlas-prisma-generation-"))
    try {
      await mkdir(join(directory, "prisma"))
      for (const name of [
        "prisma/schema.prisma",
        "prisma7.config.ts",
        "package.json",
      ]) {
        await writeFile(
          join(directory, name),
          await readFile(resolve(root, name))
        )
      }
      await symlink(
        resolve(root, "node_modules"),
        join(directory, "node_modules"),
        "dir"
      )
      const env = {
        ...process.env,
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      }
      delete env.DATABASE_URL
      delete env.DATABASE_URL_UNPOOLED
      await exec(
        process.execPath,
        [
          resolve(root, "node_modules/prisma/build/index.js"),
          "generate",
          "--config",
          "prisma7.config.ts",
        ],
        { cwd: directory, env, timeout: 25000 }
      )
      const source = await readFile(resolve(root, "lib/prisma.ts"), "utf8")
      const entry = source.match(/from "@\/(lib\/generated\/[^\"]+)"/)[1]
      await access(join(directory, `${entry}.ts`))
      const client = await readFile(join(directory, `${entry}.ts`), "utf8")
      assert.match(client, /export const PrismaClient/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
test("production build explicitly generates the client with the custom config before compiling", async () => {
  const { scripts } = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8")
  )
  assert.equal(
    scripts.build,
    "prisma generate --config prisma7.config.ts && next build"
  )
  assert.equal(
    scripts.postinstall,
    "prisma generate --config prisma7.config.ts"
  )
})
