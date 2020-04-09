import { test } from './support/ClientHelpers'

test(async rpcClient => {
  const { xRuntime, xDebugger, xProfiler } = await rpcClient.loadModules(['xRuntime', 'xDebugger', 'xProfiler'])

  await Promise.all([xRuntime.enable(), xDebugger.enable(), xProfiler.enable(), xRuntime.run()])

  await xProfiler.start()
  await new Promise(resolve => xRuntime.onExecutionContextDestroyed(resolve))
  await xProfiler.stop()
})
