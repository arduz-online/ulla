import { RpcClient, WebWorkerTransport } from '../../lib/client'

const rpcClient = new RpcClient(WebWorkerTransport(self as any))

const x = async () => {
  const data: object = await rpcClient.call('MethodX', ['a worker generated string'])
  await rpcClient.call('JumpBack', data)
}
x().catch(x => console.error(x))
