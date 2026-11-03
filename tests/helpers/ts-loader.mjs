import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const ts = require("typescript")
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) {
      return next(specifier + ".ts", context)
    }
    throw error
  }
}
export async function load(url, context, next) {
  if (url.endsWith(".ts"))
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(await readFile(new URL(url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    }
  return next(url, context)
}
