import { Hola } from "./components/component";
import { systemA, systemB } from "./systems/setup";

new Promise<any>((a, b) => a(b));

systemA.doSomething('from index')
systemB.doSomething()

{
  const e = new Entity();
  e.addComponent(new Hola());
  log("test", e.getComponent(Hola).test());
}

{
  const e = new Entity();
  e.addComponent(new Hola());
  log("test", e.getComponent(Hola).test());
}

declare var global: any;
global.onUpdate((dt: number) => engine.update(dt))