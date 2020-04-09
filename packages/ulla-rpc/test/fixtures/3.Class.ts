import { test } from './support/ClientHelpers'

test(async rpcClient => {
  const { Runtime, Debugger, Profiler } = await rpcClient.loadModules(['Runtime', 'Debugger', 'Profiler'])

  await Promise.all([Runtime.enable(), Debugger.enable(), Profiler.enable(), Runtime.run()])

  const mutex = new Promise(resolve => Profiler.onExecutionContextDestroyed(resolve))

  await Profiler.start()
  await mutex
  await Profiler.stop()
})
