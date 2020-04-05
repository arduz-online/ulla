import { Hola } from "../components/component";

export class SystemA implements ISystem {
  g?: ComponentGroup;

  activate(engine: Engine) {
    log("system a got activated");
    this.g = engine.getComponentGroup(Hola);
  }

  update(dt: number) {
    log("system a update", dt);
    for (let entity of this.g!.entities) {
      log("system a update -> entity", entity.uuid);
    }
  }

  doSomething(x: string){
    log('a->something', x)
  }
}
