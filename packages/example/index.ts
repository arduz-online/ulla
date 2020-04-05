const e = new Entity();

const a = new Promise<any>((a, b) => a(b));

@Component("a")
class Hola {
  constructor(public x = 1) {}

  test() {
    return this.x;
  }
}

e.addComponent(new Hola)

log('test', e.getComponent(Hola).test());
