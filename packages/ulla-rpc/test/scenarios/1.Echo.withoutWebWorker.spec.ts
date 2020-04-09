/// <reference path="../../../../node_modules/@types/mocha/index.d.ts" />

import { RpcHost } from '../../lib/host'
import * as assert from 'assert'
import { future } from './support/Helpers'
import { RpcClient, MemoryTransport } from '../../lib/client'

it('test/out/1.Echo.withoutWebWorker.spec', async () => {
  const memory = MemoryTransport()

  // CLIENT

  const rpcClient = new RpcClient(memory.client)

  const x = async () => {
    const data: object = await rpcClient.call('MethodX', ['a worker generated string'])
    await rpcClient.call('JumpBack', data)
  }
  x().catch(x => console.error(x))

  // SERVER

  const worker = await RpcHost.fromTransport(memory.server)

  const randomNumber = Math.random()
  const aFuture = future()

  worker.expose('MethodX', async message => {
    return { number: randomNumber }
  })

  worker.expose('JumpBack', async data => {
    aFuture.resolve(data.number)
  })

  worker.enable()

  assert.equal(await aFuture, randomNumber, 'exchanged numbers must match')

  worker.unmount()
})
