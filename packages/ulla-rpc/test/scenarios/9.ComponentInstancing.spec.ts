import { registerModule, ExposableModule, exposeProcedure } from '../../lib/host'
import { testInWorker } from './support/Helpers'

@registerModule('Greeter')
export class Greeter extends ExposableModule {
  greet(name: string) {
    return `Hello ${name}`
  }
}

@registerModule('Instancer')
export class Instancer extends ExposableModule {
  private Greeter: Greeter = this.options.getExposedModuleInstance(Greeter)

  @exposeProcedure
  async doSomething() {
    return this.Greeter.greet('World')
  }
}

describe('Intance a Component from another Component', function() {
  testInWorker('test/out/fixtures/9.ComponentInstancing.js', {
    plugins: [Instancer],
    log: false
  })
})
