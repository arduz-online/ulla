import { Hola } from "../components/component";

export class SystemB implements ISystem {
  g?: ComponentGroup;

  activate(engine: Engine) {
    log("system b got activated");
    this.g = engine.getComponentGroup(Hola);
  }

  update(dt: number) {
    log("system b update", dt);
    for (let entity of this.g!.entities) {
      log("system b update -> entity", entity.uuid);
    }
  }

  doSomething(){
    log('b->something')
  }
}
