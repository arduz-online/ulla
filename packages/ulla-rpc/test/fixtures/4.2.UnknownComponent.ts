import { testToFail } from './support/ClientHelpers'

testToFail(async rpcClient => {
  await rpcClient.loadModules([Math.random().toString()])
})
