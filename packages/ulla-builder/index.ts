#!/usr/bin/env node

// tslint:disable:no-console
import * as fs from "fs";
import * as ts from "typescript";
import * as uglify from "uglify-js";
import { inspect } from "util";
import { resolve, dirname } from "path";

ts.sys.getCurrentDirectory = () => process.cwd();

const ecsPackage = JSON.parse(
  loadArtifact(process.env.ECS_PACKAGE_JSON || "ulla-ecs/package.json")
);
const packageJson = JSON.parse(loadArtifact("package.json"));

const ecsVersion = ecsPackage.version;

console.log(`> Using ulla-ecs version ${ecsVersion}`);

const WATCH =
  process.argv.indexOf("--watch") !== -1 || process.argv.indexOf("-w") !== -1;
const PRODUCTION =
  !WATCH &&
  (process.argv.indexOf("--production") !== -1 ||
    process.env.NODE_ENV === "production");

const watchedFiles = new Set<string>();

type FileMap = ts.MapLike<{ version: number }>;

function compile(cfg: ReturnType<typeof getConfiguration>, watch: boolean) {
  console.log("");

  if (cfg.fileNames.length === 0) {
    console.error("! Error: There are no matching .ts files to process");
    process.exit(4);
  }

  const files: FileMap = {};

  // initialize the list of files
  cfg.fileNames.forEach(fileName => {
    files[fileName] = { version: 0 };
  });

  // Create the language service host to allow the LS to communicate with the host
  const services = ts.createLanguageService(
    {
      getScriptFileNames: () => cfg.fileNames,
      getScriptVersion: fileName =>
        files[fileName] && files[fileName].version.toString(),
      getScriptSnapshot: fileName => {
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
      getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory
    },
    ts.createDocumentRegistry()
  );

  if (watch) {
    // Now let's watch the files
    cfg.fileNames.forEach(fileName => {
      watchFile(fileName, services, files, cfg.libs);
    });
  }

  // First time around, emit all files
  emitFile(cfg.fileNames[0], services, cfg.libs);
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

function emitFile(
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

  logErrors(fileName, services);

  const ecsPackageECS = loadArtifact(
    process.env.ECS_PATH || "ulla-ecs/dist/src/index.js"
  );
  const ecsPackageAMD = loadArtifact(
    process.env.AMD_PATH || "ulla-ecs/artifacts/amd.js"
  );

  const loadedLibs = libs
    .map(lib => {
      `/*! ${lib} */;\n${loadArtifact(lib)}\n`;
    })
    .join("");

  output.outputFiles.forEach(o => {
    console.log(
      `> Emitting ${o.name.replace(ts.sys.getCurrentDirectory(), "")}`
    );

    let generatedCode: string = PRODUCTION
      ? o.text
      : `eval(${JSON.stringify(o.text)});`;

    let ret =
      `/*! ulla-ecs@${ecsVersion} */;\n${ecsPackageECS};\n` +
      `/*! ulla-amd */;\n${ecsPackageAMD};\n` +
      loadedLibs +
      `/*! code */;\n${generatedCode}`;

    const compiled = uglify.minify(ret, {
      mangle: PRODUCTION
        ? {
            reserved: ["dcl"]
          }
        : false,
      compress: PRODUCTION,
      output: {
        comments: /^!/
      }
    });

    if (compiled.warnings) {
      for (let warning of compiled.warnings) {
        console.warn("!   Warning: " + warning);
      }
    }

    if (compiled.error) {
      console.warn("!   Error: " + compiled.error);
      ret =
        ret +
        `;\n throw new Error("Compilation error: " + ${JSON.stringify(
          compiled.error
        )})`;
    }

    ensureDirectoriesExist(dirname(o.name));

    fs.writeFileSync(o.name, WATCH || PRODUCTION ? ret : compiled.code, "utf8");

    if (WATCH) {
      console.log("\nThe compiler is watching file changes...\n");
    } else {
      if (compiled.error) {
        throw compiled.error;
      }
    }
  });
}

function logErrors(fileName: string, services: ts.LanguageService) {
  let allDiagnostics = services
    .getCompilerOptionsDiagnostics()
    .concat(services.getSyntacticDiagnostics(fileName))
    .concat(services.getSemanticDiagnostics(fileName));

  allDiagnostics.forEach(printDiagnostic);
}

function getConfiguration(
  packageJson: any
): ts.ParsedCommandLine & { libs: string[] } {
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory
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
      "! Error: tsconfig.json: ulla-ecs only allows AMD modules"
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
  }

  if (hasError) {
    console.log("tsconfig.json:");
    console.log(inspect(tsconfig.options, false, 10, true));
    process.exit(1);
  }

  if (PRODUCTION) {
    tsconfig.options.inlineSourceMap = false;
    tsconfig.options.sourceMap = false;
    tsconfig.options.removeComments = true;
  }

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

function loadArtifact(path: string): string {
  try {
    if (ts.sys.fileExists(path)) {
      return ts.sys.readFile(path);
    }

    const ecsPackageAMD = "node_modules/" + path;

    if (ts.sys.fileExists(ecsPackageAMD)) {
      return ts.sys.readFile(ecsPackageAMD);
    }

    const module = require.resolve(path);

    if (ts.sys.fileExists(module)) {
      return ts.sys.readFile(module);
    }

    throw new Error();
  } catch (e) {
    console.error(`! Error: ${process.cwd() + "/" + path} not found` + e);
    process.exit(2);
  }
}

function ensureDirectoriesExist(folder: string) {
  if (!ts.sys.directoryExists(folder)) {
    ensureDirectoriesExist(resolve(folder, ".."));
    ts.sys.createDirectory(folder);
  }
}

// Start the watcher
compile(getConfiguration(packageJson), WATCH);
