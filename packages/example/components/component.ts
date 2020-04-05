import { getId } from "../systems/systemA";

@Component("a")
export class Hola {
  constructor(public x = getId()) {}

  test() {
    return this.x;
  }
}
