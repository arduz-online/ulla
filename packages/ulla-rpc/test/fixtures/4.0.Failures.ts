import { testToFail } from './support/ClientHelpers'
import { Methods } from './support/ClientCommons'

testToFail(async rpcClient => {
  const { Methods } = (await rpcClient.loadModules(['Methods'])) as {
    Methods: Methods
  }

  // this line throws an error in the RPC host
  // the error should be forwarded to the client
  // and it should create and throw a valid instance of Error (js)
  await Methods.fail()
})
