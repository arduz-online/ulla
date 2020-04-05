import { Hola } from "../components/component";

export class SystemA implements ISystem {
  g: ComponentGroup;

  activate(engine: Engine) {
    log("system got activated");
    this.g = engine.getComponentGroup(Hola);
  }

  update(dt) {
    log("system a update", dt);
    for (let entity of this.g.entities) {
      log("system a update -> entity", entity.uuid);
    }
  }

  doSomething(x: string){
    log('a->something', x)
  }
}

let i = 0
export function getId(): number {
  return i++
}