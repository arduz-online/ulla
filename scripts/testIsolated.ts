// Create a new isolate limited to 128MB
import ivm = require("isolated-vm");
import expect = require("expect");
import { readFileSync } from "fs-extra";
const isolate = new ivm.Isolate({ memoryLimit: 128 });
const logs: any[][] = [];
// Create a new context within this isolate. Each context has its own copy of all the builtin
// Objects. So for instance if one context does Object.prototype.foo = 1 this would not affect any
// other contexts.
const context = isolate.createContextSync();

// Get a Reference{} to the global object within the context.
const jail = context.global;

// This make the global object available in the context as `global`. We use `derefInto()` here
// because otherwise `global` would actually be a Reference{} object in the new isolate.
jail.setSync("global", jail.derefInto());

// We will create a basic `log` function for the new isolate to use.
const logCallback = function(...args) {
  logs.push(args);
  console.log("Isolate>", ...args);
};

context.evalClosureSync(
  `global._log = function(...args) {
	$0.applyIgnored(undefined, args, { arguments: { copy: true } });
}`,
  [logCallback],
  { arguments: { reference: true } }
);

const script = readFileSync(process.argv[2]).toString();

// And let's test it out:
context
  .eval(script)
  .then(() => {
    expect(logs.length).toEqual(1);
    expect(logs[0]).toEqual(["test", 1]);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
// > hello world
