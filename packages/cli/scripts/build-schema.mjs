import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const schemaPath = "configuration_schema.json";
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

if (schema.$schema !== "http://json-schema.org/draft-07/schema#") {
  throw new Error("configuration_schema.json must declare JSON Schema Draft 7");
}
if (schema.$ref) {
  throw new Error("configuration_schema.json must be self-contained (no top-level $ref)");
}

mkdirSync("dist", { recursive: true });
copyFileSync(schemaPath, "dist/configuration_schema.json");
console.log("[schema] validated Draft 7 configuration_schema.json → dist/");
