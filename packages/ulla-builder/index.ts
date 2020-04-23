#!/usr/bin/env node

// tslint:disable:no-console
import * as fs from "fs";
import * as ts from "typescript";
import * as terser from "terser";
import ivm = require("isolated-vm");
import { inspect } from "util";
import { resolve, dirname, relative } from "path";

ts.sys.getCurrentDirectory = () => process.cwd();

const packageJson = JSON.parse(loadArtifact("package.json"));

const nameCache = {};

console.log(`> ulla-builder`);

const WATCH =
  process.argv.indexOf("--watch") !== -1 || process.argv.indexOf("-w") !== -1;
const PRODUCTION =
  !WATCH &&
  (process.argv.indexOf("--production") !== -1 ||
    process.env.NODE_ENV === "production");

const watchedFiles = new Set<string>();

type FileMap = ts.MapLike<{ version: number }>;

async function compile(
  cfg: ReturnType<typeof getConfiguration>,
  watch: boolean
) {
  console.log("");

  if (cfg.fileNames.length === 0) {
    console.error("! Error: There are no matching .ts files to process");
    process.exit(4);
  }

  const files: FileMap = {};

  // initialize the list of files
  cfg.fileNames.forEach((fileName) => {
    files[fileName] = { version: 0 };
  });

  // Create the language service host to allow the LS to communicate with the host
  const services = ts.createLanguageService(
    {
      getScriptFileNames: () => cfg.fileNames,
      getScriptVersion: (fileName) =>
        files[fileName] && files[fileName].version.toString(),
      getScriptSnapshot: (fileName) => {
        if (!fs.existsSync(fileName)) {
          return undefined;
        }

        if (watch) {
          watchFile(fileName, services, files, cfg.libs);
        }

        return ts.ScriptSnapshot.fromString(
          fs.readFileSync(fileName).toString()
        );
      },
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCompilationSettings: () => cfg.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
    },
    ts.createDocumentRegistry()
  );

  if (watch) {
    // Now let's watch the files
    cfg.fileNames.forEach((fileName) => {
      watchFile(fileName, services, files, cfg.libs);
    });
  }

  // First time around, emit all files
  await emitFile(cfg.fileNames[0], services, cfg.libs);
}

function watchFile(
  fileName: string,
  services: ts.LanguageService,
  files: FileMap,
  libs: string[]
) {
  if (!watchedFiles.has(fileName)) {
    watchedFiles.add(fileName);

    files[fileName] = { version: 0 };

    // Add a watch on the file to handle next change
    fs.watchFile(
      fileName,
      { persistent: true, interval: 250 },
      (curr, prev) => {
        // Check timestamp
        if (+curr.mtime <= +prev.mtime) {
          return;
        }

        // Update the version to signal a change in the file
        files[fileName].version++;

        // write the changes to disk
        emitFile(fileName, services, libs);
      }
    );
  }
}

function minify(files: string | string[] | { [file: string]: string }) {
  const result = terser.minify(files, {
    ecma: 2020,
    warnings: true,
    nameCache,
    mangle: {
      toplevel: false,
      module: false,
      eval: true,
      keep_classnames: true,
      keep_fnames: true,
      reserved: ["global", "define"],
    },
    compress: {
      passes: 2,
    },
    output: {
      comments: /^!/,
      beautify: false,
    },
    sourceMap: false,
    toplevel: false,
  });

  if (result.warnings) {
    for (let warning of result.warnings) {
      console.warn("!   Warning: " + warning);
    }
  }

  if (result.error) {
    console.warn("!   Error: " + result.error);
  }

  return result;
}

async function emitFile(
  fileName: string,
  services: ts.LanguageService,
  libs: string[]
) {
  let output = services.getEmitOutput(fileName);

  if (!output.emitSkipped) {
    console.log(
      `> Processing ${fileName.replace(ts.sys.getCurrentDirectory(), "")}`
    );
  } else {
    console.log(
      `> Processing ${fileName.replace(
        ts.sys.getCurrentDirectory(),
        ""
      )} failed`
    );
  }

  logErrors(services);

  type OutFile = {
    readonly path: string;
    definition?: {
      path: string;
      content: string;
    };
    content?: string;
  };

  const loadedLibs: OutFile[] = [];

  function loadUllaLib(lib: string) {
    const path = resolveFile(lib);

    if (path) {
      const json: OutFile[] = JSON.parse(loadArtifact(lib));
      loadedLibs.push(...json);
      return true;
    }

    return false;
  }

  function loadJsLib(lib: string) {
    const path = resolveFile(lib);

    if (path) {
      loadedLibs.push({
        path: relative(ts.sys.getCurrentDirectory(), path),
        content: loadArtifact(lib),
      });
      return true;
    }

    return false;
  }

  function loadLibOrJs(lib: string) {
    return loadUllaLib(lib + ".lib") || loadJsLib(lib) || false;
  }

  libs.forEach((lib) => {
    if (!loadLibOrJs(lib)) {
      console.error(`! Error: could not load lib: ${lib}`);
    }
  });

  const out = new Map<string, OutFile>();

  function getOutFile(path: string) {
    let f: OutFile = out.get(path);
    if (!f) {
      f = { path };
      out.set(path, f);
    }
    return f;
  }

  function normalizePath(path: string) {
    return path.replace(ts.sys.getCurrentDirectory(), "");
  }

  for (let o of output.outputFiles) {
    if (o.name.endsWith(".d.ts")) {
      const filePath = o.name.replace(/\.d\.ts$/, ".js");
      const f = getOutFile(filePath);

      f.definition = {
        content: o.text,
        path: o.name,
      };
    } else {
      const f = getOutFile(o.name);
      f.content = o.text;
    }
  }

  for (let [, file] of out) {
    if (
      file.path.endsWith(".js") &&
      file.content &&
      !file.path.endsWith(".min.js")
    ) {
      loadedLibs.push({
        path: relative(ts.sys.getCurrentDirectory(), fileName),
        content: file.content,
      });

      const ret: string[] = [];

      for (let { path, content } of loadedLibs) {
        const code = content + "\n//# sourceURL=ulla-build:///" + path;

        ret.push(`/* ${JSON.stringify(path)} */ eval(${JSON.stringify(code)})`);
      }

      file.content = ret.join("\n");

      {
        // deps
        const deps = getOutFile(file.path + ".lib");
        deps.content = JSON.stringify(loadedLibs, null, 2);
      }

      {
        // minify && map
        const minifiedFile = getOutFile(file.path.replace(/\.js$/, ".min.js"));
        console.log(`> preparing ${normalizePath(minifiedFile.path)}`);

        const m = minify(loadedLibs.map(($) => $.content).join(";\n"));
        minifiedFile.content = m.code;

        if (m.map) {
          const f = getOutFile(file.path.replace(/\.js$/, ".js.map"));
          f.content = typeof m.map === "string" ? m.map : JSON.stringify(m.map);
        }
      }
    }
  }

  for (let [, file] of out) {
    ensureDirectoriesExist(dirname(file.path));
    if (file.content) {
      console.log(`> writing ${normalizePath(file.path)}`);
      fs.writeFileSync(file.path, file.content, "utf8");
    }
    if (file.definition) {
      console.log(`> writing ${normalizePath(file.definition.path)}`);
      fs.writeFileSync(file.definition.path, file.definition.content, "utf8");
    }
  }

  console.log("> Validating runtimes...");
  for (let [, file] of out) {
    if (file.path.endsWith(".js") && file.content) {
      if (WATCH) {
        const script = testScript(file.content);

        script
          .then(() => {
            console.log("> Validation OK");
          })
          .catch((e) => {
            console.log("! Validation error: " + e.message);
          });

        await script;
      } else {
        await testScript(file.content);
      }
    }
  }
  if (WATCH) {
    console.log("\nThe compiler is watching file changes...\n");
  }
}

function logErrors(services: ts.LanguageService) {
  let allDiagnostics = services
    .getCompilerOptionsDiagnostics()
    .concat(services.getProgram().getGlobalDiagnostics())
    .concat(services.getProgram().getSemanticDiagnostics())
    .concat(services.getProgram().getSyntacticDiagnostics());

  allDiagnostics.forEach(printDiagnostic);
}

function getConfiguration(
  packageJson: any
): ts.ParsedCommandLine & { libs: string[] } {
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
  const parsed = ts.parseConfigFileTextToJson(
    "tsconfig.json",
    ts.sys.readFile("tsconfig.json")
  );

  if (parsed.error) {
    printDiagnostic(parsed.error);
    process.exit(1);
  }

  const tsconfig = ts.parseJsonConfigFileContent(
    parsed.config,
    host,
    ts.sys.getCurrentDirectory(),
    {}
  );

  let hasError = false;

  if (tsconfig.options.module !== ts.ModuleKind.AMD) {
    console.error(
      "! Error: tsconfig.json: ulla-builder only allows AMD modules"
    );
    hasError = true;
  }

  if (!tsconfig.options.outFile) {
    console.error("! Error: tsconfig.json: invalid outFile");
    hasError = true;
  }

  const outFile = ts.sys.resolvePath(tsconfig.options.outFile);
  const mainFile = ts.sys.resolvePath(packageJson.main);

  if (!outFile) {
    console.error(`! Error: field "main" in tsconfig.json is missing.`);
    hasError = true;
  }

  if (!mainFile) {
    console.error(`! Error: field "main" in package.json is missing.`);
    hasError = true;
  }

  if (outFile !== mainFile) {
    console.error(
      `! Error: tsconfig.json .outFile is not equal to package.json .main\n       (${outFile.replace(
        ts.sys.getCurrentDirectory(),
        ""
      )} != ${mainFile.replace(ts.sys.getCurrentDirectory(), "")})`
    );
    hasError = true;
  }

  const libs: string[] = [];

  const ullaLibs = packageJson.ulla?.libs;

  if (ullaLibs) {
    if (ullaLibs instanceof Array) {
      ullaLibs.forEach(($, ix) => {
        if (typeof $ == "string") {
          libs.push($);
        } else {
          console.error(
            `! Error: package.json .ulla.libs must be an array of strings. The element number ulla.libs[${ix}] is not a string.`
          );
          hasError = true;
        }
      });
    } else {
      console.error(
        `! Error: package.json .ulla.libs must be an array of strings.`
      );
      hasError = true;
    }
  } else {
    console.error(`! Notice: injecting AMD & ECS libraries.`);

    libs.push(process.env.ECS_PATH || "ulla-ecs/dist/src/index.js");
    libs.push(process.env.AMD_PATH || "ulla-ecs/artifacts/amd.js");
  }

  if (hasError) {
    console.log("tsconfig.json:");
    console.log(inspect(tsconfig.options, false, 10, true));
    process.exit(1);
  }

  tsconfig.options.inlineSourceMap = true;
  tsconfig.options.inlineSources = true;
  tsconfig.options.sourceMap = false;
  tsconfig.options.removeComments = false;
  tsconfig.options.sourceRoot = ts.sys.getCurrentDirectory();

  return Object.assign(tsconfig, { libs });
}

function printDiagnostic(diagnostic: ts.Diagnostic) {
  let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file) {
    let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start!
    );
    console.log(
      `  Error ${diagnostic.file.fileName.replace(
        ts.sys.getCurrentDirectory(),
        ""
      )} (${line + 1},${character + 1}): ${message}`
    );
  } else {
    console.log(`  Error: ${message}`);
  }
}

function resolveFile(path: string): string | null {
  if (ts.sys.fileExists(path)) {
    return path;
  }

  let ecsPackageAMD = "node_modules/" + path;

  if (ts.sys.fileExists(ecsPackageAMD)) {
    return ecsPackageAMD;
  }

  ecsPackageAMD = "../node_modules/" + path;

  if (ts.sys.fileExists(ecsPackageAMD)) {
    return ecsPackageAMD;
  }

  ecsPackageAMD = "../../node_modules/" + path;

  if (ts.sys.fileExists(ecsPackageAMD)) {
    return ecsPackageAMD;
  }
  return null;
}

function loadArtifact(path: string): string {
  try {
    const resolved = resolveFile(path);
    if (resolved) {
      return ts.sys.readFile(resolved);
    }

    throw new Error();
  } catch (e) {
    console.error(`! Error: ${path} not found. ` + e);
    process.exit(2);
  }
}

function ensureDirectoriesExist(folder: string) {
  if (!ts.sys.directoryExists(folder)) {
    ensureDirectoriesExist(resolve(folder, ".."));
    ts.sys.createDirectory(folder);
  }
}

const isolate = new ivm.Isolate({ memoryLimit: 128 });

/// test script using an isolated-vm, it should not throw any error
async function testScript(script: string) {
  // Create a new context within this isolate. Each context has its own copy of all the builtin
  // Objects. So for instance if one context does Object.prototype.foo = 1 this would not affect any
  // other contexts.
  const context = isolate.createContextSync();

  // Get a Reference{} to the global object within the context.
  const jail = context.global;

  // This make the global object available in the context as `global`. We use `derefInto()` here
  // because otherwise `global` would actually be a Reference{} object in the new isolate.
  await jail.set("global", jail.derefInto());

  // We will create a basic `log` function for the new isolate to use.
  const logCallback = function (...args) {
    console.log("VM> ", ...args);
  };

  // We will create a basic `log` function for the new isolate to use.
  const errorCallback = function (...args) {
    console.log("VM Error> ", ...args);
  };

  context.evalClosureSync(
    `
    let starters = []
    let ___updaters = []

    global.onStart = function(fn) {
      starters.push(fn)
    }

    global.onUpdate = function(fn) {
      ___updaters.push(fn)
    }

    global.didStart = function() {
      starters.forEach($ => $())
    }

    global.__runUpdaters = function(dt) {
      ___updaters.forEach($ => $(dt))
    }

    global.loadModule = function(moduleName, exports) {
      return new Promise((_, reject) => reject(new Error("Modules do not load in VM validation mode: " + moduleName)))
    }

    global.envName = 'test-vm'

    global._log = function(...args) {
      $0.applyIgnored(undefined, args, { arguments: { copy: true } });
    }
    global._error = function(...args) {
      $1.applyIgnored(undefined, args, { arguments: { copy: true } });
    }`,
    [logCallback, errorCallback],
    { arguments: { reference: true } }
  );

  await isolate.compileScriptSync(script).run(context);

  await context.eval("didStart()");

  console.log("> Runtime started...");

  console.log("> Running 3 frames...");

  await context.eval("__runUpdaters(0.10)");
  await context.eval("__runUpdaters(0.11)");
  await context.eval("__runUpdaters(0.12)");

  console.log("> Done...");

  context.release();
}

// Start the watcher
compile(getConfiguration(packageJson), WATCH).catch((e) => {
  console.error(e);
  process.exit(1);
});
