import { sync } from "glob";
import { basename, dirname, resolve } from "path";
import { renameSync, readFileSync, writeFileSync } from "fs-extra";

const files = sync(`packages/ulla-ecs/types/env/lib.*.d.ts`);

console.log(`> copyng libs from typescript`);

files.forEach($ => {
  const from = $;
  const to = resolve(dirname($), basename($).replace(/^lib\./, ""));

  renameSync(from, to);
});

console.log(`> altering libs`);

const libFiles = sync(`packages/ulla-ecs/types/env/*.d.ts`);

libFiles.forEach($ => {
  const content = readFileSync($)
    .toString()
    .replace(
      /<reference\s*lib="(es[^"]+)"\s*\/>/gm,
      '<reference path="./$1.d.ts" />'
    );

  writeFileSync($, content);
});
