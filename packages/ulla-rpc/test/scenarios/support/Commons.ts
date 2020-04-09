import {
  ExposableModule,
  exposeProcedure,
  registerModule,
  RpcHost
} from "../../../lib/host";
import { future } from "./Helpers";
import "./MessageBusManager";

@registerModule("Logger")
export class Logger extends ExposableModule {
  @exposeProcedure
  async error(message: string) {
    console.error.call(console, message);
  }

  @exposeProcedure
  async log(message: string) {
    console.log.call(console, message);
  }

  @exposeProcedure
  async warn(message: string) {
    console.warn.call(console, message);
  }

  @exposeProcedure
  async info(message: string) {
    console.info.call(console, message);
  }
}

@registerModule("Methods")
export class Methods extends ExposableModule {
  store: { [key: string]: any } = {};

  @exposeProcedure
  async setValue(key: string, value: any) {
    this.store[key] = value;
  }

  @exposeProcedure
  async getValue(key: string) {
    return this.store[key];
  }

  @exposeProcedure
  async bounce(...args: any[]) {
    return args;
  }

  @exposeProcedure
  async enable() {
    return 1;
  }

  @exposeProcedure
  async singleBounce(arg: any) {
    return arg;
  }

  @exposeProcedure
  async ret0() {
    return 0;
  }

  @exposeProcedure
  async retNull() {
    return null;
  }

  @exposeProcedure
  async retFalse() {
    return false;
  }

  @exposeProcedure
  async retTrue() {
    return true;
  }

  @exposeProcedure
  async retEmptyStr() {
    return "";
  }

  @exposeProcedure
  async getRandomNumber() {
    return Math.random();
  }

  @exposeProcedure
  async fail() {
    throw new Error("A message");
  }

  @exposeProcedure
  async receiveObject(obj: any) {
    if (typeof obj !== "object") {
      throw new Error("Did not receive an object");
    }
    return { received: obj };
  }

  @exposeProcedure
  async failsWithoutParams() {
    if (arguments.length !== 1) {
      throw new Error(
        `Did not receive an argument. got: ${JSON.stringify(arguments)}`
      );
    }
    return { args: arguments };
  }

  @exposeProcedure
  async failsWithParams() {
    if (arguments.length !== 0) {
      throw new Error(
        `Did receive arguments. got: ${JSON.stringify(arguments)}`
      );
    }
    return { args: arguments };
  }
}

@registerModule("Test")
export class Test extends ExposableModule {
  future = future<{ pass: boolean; arg: any }>();

  async waitForPass() {
    const result = await this.future;

    if (!result.pass) {
      throw Object.assign(
        new Error(
          "WebWorker test failed. The worker did not report error data."
        ),
        result.arg || {}
      );
    }

    return result.arg;
  }

  @exposeProcedure
  async fail(arg: any) {
    this.future.resolve({ pass: false, arg });
  }

  @exposeProcedure
  async pass(arg: any) {
    this.future.resolve({ pass: true, arg });
  }
}

export function setUpPlugins(worker: RpcHost) {
  worker.getExposedModuleInstance(Logger);
  worker.getExposedModuleInstance(Methods);
  worker.getExposedModuleInstance(Test);
}
