// tslint:disable-next-line:no-commented-out-code
// tslint:disable:no-console

import path = require("path");
// tslint:disable:no-console
import fs = require("fs-extra");
import { ensureFileExists, copyFile } from "./_utils";

const root = path.resolve(__dirname, "../packages/ulla-ecs/");

const original = ensureFileExists(root, "/dist/index.d.ts");

copyFile(original, root + "/types/ulla/index.d.ts");

const dtsFile = ensureFileExists(root, "/types/ulla/index.d.ts");
{
  let content = fs.readFileSync(dtsFile).toString();
  content = content.replace(/^export {\s*}/gm, "");
  content = content.replace(/^export /gm, "");

  fs.writeFileSync(dtsFile, content);

  if (content.match(/\bimport\b/)) {
    throw new Error(`The file ${dtsFile} contains imports:\n${content}`);
  }

  if (content.includes("/// <ref")) {
    throw new Error(`The file ${dtsFile} contains '/// <ref':\n${content}`);
  }
}
