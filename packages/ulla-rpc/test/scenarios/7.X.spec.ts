import { testInWorker } from './support/Helpers'
import { Logger, Methods, Test } from './support/Commons'
import { registerModule, ExposableModule, exposeProcedure, RpcHost } from '../../lib/host'
import * as assert from 'assert'

@registerModule('Test7')
export class Test7 extends ExposableModule {
  receivedNumber: number = -1
  status: string = ''

  @exposeProcedure
  async setNumber(num: number) {
    this.receivedNumber = num
  }

  @exposeProcedure
  async setStatus() {
    this.status = 'ready'
  }

  @exposeProcedure
  async doSomething(): Promise<any> {
    if (this.status === 'ready') {
      return true
    }

    throw new Error('Component was not ready yet')
  }

  @exposeProcedure
  async isReady(): Promise<boolean> {
    return this.status === 'ready'
  }
}

describe('Class based systems', function() {
  testInWorker('test/out/fixtures/7.0.MethodsInjection.js', {
    plugins: [Logger, Methods, Test],
    log: false
  })

  testInWorker('test/out/fixtures/7.0.MethodsInjection.js?without_preload', {
    plugins: [],
    log: false
  })

  testInWorker('test/out/fixtures/7.1.InheritInjections.js', {
    plugins: [],
    log: false
  })

  testInWorker('test/out/fixtures/7.2.ValidateValuesInServer.js', {
    plugins: [],
    log: false,
    validateResult: (result: any, worker: RpcHost) => {
      const test7 = worker.getExposedModuleInstance(Test7)
      assert.notEqual(test7.receivedNumber, -1)
    }
  })

  testInWorker('test/out/fixtures/7.3.Interval.js', {
    plugins: [],
    log: false,
    validateResult: (result: any, worker: RpcHost) => {
      const test7 = worker.getExposedModuleInstance(Test7)

      setTimeout(() => {
        return test7.setStatus()
      }, 500)
    }
  })
})
