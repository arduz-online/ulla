import { registerModule, ExposableModule, exposeProcedure } from '../../lib/host'

import * as assert from 'assert'
import { future, testInWorker } from './support/Helpers'

const aFuture = future()

@registerModule('Debugger')
export class Debugger extends ExposableModule {
  @exposeProcedure
  async enable() {
    return 1
  }
}

@registerModule('Profiler')
export class Profiler extends ExposableModule {
  @exposeProcedure
  async enable() {
    return 1
  }

  @exposeProcedure
  async start() {
    setTimeout(() => {
      this.options.notify('ExecutionContextDestroyed')
    }, 16)
  }

  @exposeProcedure
  async stop() {
    aFuture.resolve(true)
    return { data: 'noice!' }
  }
}

@registerModule('Runtime')
export class Runtime extends ExposableModule {
  @exposeProcedure
  async enable() {
    return 1
  }

  @exposeProcedure
  async run() {
    return 1
  }
}

testInWorker('test/out/fixtures/3.Class.js', {
  plugins: [Debugger, Profiler, Runtime],
  validateResult: async result => {
    assert.equal(await aFuture, true)
  }
})
