import { sync } from "glob";
import { basename, dirname, resolve } from "path";
import { renameSync, readFileSync, writeFileSync } from "fs-extra";

const files = sync(`packages/ulla-ecs/types/env/lib.*.d.ts`);

files.forEach($ => {
  const from = $;
  const to = resolve(dirname($), basename($).replace(/^lib\./, ""));
  console.log(`> renaming ${from} to ${to}`);
  renameSync(from, to);
});

const libFiles = sync(`packages/ulla-ecs/types/env/*.d.ts`);

libFiles.forEach($ => {
  const content = readFileSync($)
    .toString()
    .replace(/<reference\s*lib="(es[^"]+)"\s*\/>/gm, '<reference path="./$1.d.ts" />');

  writeFileSync($, content);
});
