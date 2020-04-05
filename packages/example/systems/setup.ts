import { SystemA } from "./systemA";
import { SystemB } from "./systemB";

export const systemA = engine.addSystem(new SystemA());
export const systemB = engine.addSystem(new SystemB());