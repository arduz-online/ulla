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
  const content = fs.readFileSync(dtsFile).toString();

  fs.writeFileSync(dtsFile, content.replace(/^export /gm, ""));

  if (content.match(/\bimport\b/)) {
    throw new Error(`The file ${dtsFile} contains imports:\n${content}`);
  }

  if (content.includes("/// <ref")) {
    throw new Error(`The file ${dtsFile} contains '/// <ref':\n${content}`);
  }
}
