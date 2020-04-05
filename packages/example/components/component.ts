let i = 0
function getId(): number {
  return i++
}

@Component("a")
export class Hola {
  constructor(public x = getId()) {}

  test() {
    return this.x;
  }
}
