import { Server } from 'http'
import * as assert from 'assert'
import { Server as WebSocketServer } from 'ws'
import { WebSocketTransport, RpcClient } from '../../lib/client'
import { RpcTransport } from '../../lib/common/json-rpc/types'

export interface Methods {
  fail(): Promise<void>
  enable(): Promise<void>
  getRandomNumber(): Promise<number>
  receiveObject<T>(object: T): Promise<{ received: T }>
  failsWithoutParams(...args: any[]): Promise<any>
  failsWithParams(...args: any[]): Promise<any>
  fail(): Promise<void>
  setValue(key: string, value: any): Promise<void>
  getValue(key: string): Promise<any>
  bounce<T>(...args: T[]): Promise<T>

  ret0(): Promise<0>
  retEmptyStr(): Promise<''>
  retNull(): Promise<null>
  retFalse(): Promise<false>
  retTrue(): Promise<true>

  singleBounce<T>(a: T): Promise<T>
}

function testWithTransport(transport: RpcTransport, fn: (script: RpcClient) => Promise<any>) {
  const rpcClient = new RpcClient(transport)
  rpcClient.on('error', (e: Error) => {
    console.log('error in script')
    console.dir(e)
  })

  rpcClient.loadModules(['Test'])
    .then((APIs: any) =>
      fn(rpcClient)
        .then(x => APIs.Test.pass(x))
        .catch(x => {
          console.error('Test failed')
          console.error(x)
          return APIs.Test.fail(x)
        })
    )
    .catch((x: Error) => console.error(x))
}

export function initializeWebSocketTester(server: Server) {
  const wss = new WebSocketServer({ server })
  wss.on('connection', function connection(ws, req) {
    console.log('Got websocket connection')

    testWithTransport(WebSocketTransport(ws as any), async rpcClient => {
      const { Methods } = (await rpcClient.loadModules(['Methods'])) as {
        Methods: Methods
      }

      assert.equal(await Methods.enable(), 1)
      assert.equal(typeof await Methods.getRandomNumber(), 'number')
      assert((await Methods.getRandomNumber()) > 0)

      const sentObject = {
        x: await Methods.getRandomNumber()
      }

      assert.equal(await Methods.ret0(), 0)
      assert.equal(await Methods.retFalse(), false)
      assert.equal(await Methods.retNull(), null)
      assert.equal(await Methods.retEmptyStr(), '')
      assert.equal(await Methods.retTrue(), true)

      assert.deepEqual(await Methods.receiveObject(sentObject), {
        received: sentObject
      })

      await Methods.failsWithoutParams(1)
      await Methods.failsWithParams()

      const sentElements = [1, true, null, false, 'xxx', { a: null }]

      assert.deepEqual(await Methods.bounce(...sentElements), sentElements)
      assert.deepEqual(await Methods.singleBounce(sentElements), sentElements)

      for (let $ of sentElements) {
        assert.deepEqual(await Methods.singleBounce($), $)
      }
    })
  })
  wss.on('error', e => console.log(e))
  return wss
}
