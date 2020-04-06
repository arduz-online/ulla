import { TestableScript } from './support/ClientHelpers'
import { inject, WebWorkerTransport } from '../../lib/client/index'
import * as assert from 'assert'

export default class ComponentInstancing extends TestableScript {
  @inject('Instancer') Instancer: any = null

  async doTest() {
    const msg = await this.Instancer.doSomething()
    assert.equal(msg, 'Hello World')
  }
}

new ComponentInstancing(WebWorkerTransport(self as any))