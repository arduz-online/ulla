import { Hola } from "../components/component";
import { systemA } from "./setup";

export class SystemB implements ISystem {
  g: ComponentGroup;

  activate(engine: Engine) {
    log("system got activated");
    this.g = engine.getComponentGroup(Hola);
  }

  update(dt) {
    log("system b update", dt);
    for (let entity of this.g.entities) {
      log("system b update -> entity", entity.uuid);
    }
  }

  doSomething(){
    log('b->something')
    systemA.doSomething('from b')
  }
}
