import { TransportBasedServer } from './TransportBasedServer'
import { ExposableModule, ExposableModuleOptions, ExposedModuleClass } from './ExposableModule'
import { RpcTransport } from '../common/json-rpc/types'
import { hasOwnSymbol } from '../common/core/SymbolShim'

// If there is no native Symbol
// nor polyfill, then a plain number is used for performance.
// tslint:disable-next-line
const hasSymbol = typeof Symbol === 'function' && Symbol.for

const apiNameSymbol: any = hasSymbol ? Symbol('pluginName') : 0xfea2

const registeredAPIs: Record<string, ExposedModuleClass<ExposableModule>> = {}

namespace PrivateHelpers {
  export function _registerModule(apiName: string, api: ExposedModuleClass<ExposableModule>) {
    const hasName = hasOwnSymbol(api, apiNameSymbol)
    if (hasName) {
      throw new Error(`The API you are trying to register is already registered`)
    }

    if (apiName in registeredAPIs) {
      throw new Error(`The API ${apiName} is already registered`)
    }

    if (typeof (api as any) !== 'function') {
      throw new Error(`The API ${apiName} is not a class, it is of type ${typeof api}`)
    }

    // save the registered name
    // tslint:disable-next-line:semicolon
    ;(api as any)[apiNameSymbol] = apiName

    registeredAPIs[apiName] = api
  }

  export function unmountAPI(api: ExposableModule) {
    if (api.apiWillUnmount) {
      const promise = api.apiWillUnmount()
      if (promise && 'catch' in promise) {
        promise.catch(error => console.error('Error unmounting API', { api, error }))
      }
    }
  }

  export function mountAPI(api: ExposableModule) {
    if (api.apiDidMount) {
      const promise = api.apiDidMount()
      if (promise && 'catch' in promise) {
        promise.catch(error => console.error('Error mounting API', { api, error }))
      }
    }
  }
}

// HERE WE START THE EXPORTS

export enum RpcHostEvents {
  systemWillUnmount = 'systemWillUnmount',
  systemWillEnable = 'systemWillEnable',
  systemDidUnmount = 'systemDidUnmount'
}

export function getModuleName(klass: ExposedModuleClass<ExposableModule>): string | null {
  return (klass as any)[apiNameSymbol] || klass.name || null
}

export function registerModule(apiName: string): (klass: ExposedModuleClass<ExposableModule>) => void {
  return function(api: ExposedModuleClass<ExposableModule>) {
    PrivateHelpers._registerModule(apiName, api)
  }
}

export class RpcHost extends TransportBasedServer {
  unmounted = false

  apiInstances: Map<string, ExposableModule> = new Map()

  private constructor(worker: RpcTransport) {
    super(worker)

    this.expose('LoadModules', this.RPCLoadModules.bind(this))
  }

  static async fromTransport(transport: RpcTransport) {
    return new RpcHost(transport)
  }

  /**
   * This methdod should be called only from the interface that manages the RpcHost.
   * It initializes the system and it's queued components. It also sends a first notification
   * to the implementation of the system telling it is now enabled. In that moment, the
   * implementation will send the queued messages and execute the queued methods against the
   * materialized components.
   *
   * It:
   *  1) emits a RpcHostEvents.systemWillEnable event
   *  2) mounts all the components
   *  3) sends the notification to the actual system implementation
   */
  enable() {
    this.emit(RpcHostEvents.systemWillEnable)
    this.apiInstances.forEach(PrivateHelpers.mountAPI)
    super.enable()
  }

  /**
   * This is a service locator, it locates or instantiate the requested component
   * for this instance of RpcHost.
   *
   * @param api A class constructor
   */
  getExposedModuleInstance<X>(api: { new (options: ExposableModuleOptions): X }): X

  /**
   * This is a service locator, it locates or instantiate the requested component
   * for this instance of RpcHost.
   *
   * @param name The name of used to register the component
   */
  getExposedModuleInstance(name: string): ExposableModule | null

  getExposedModuleInstance(api: any) {
    if (typeof api === 'string') {
      if (this.apiInstances.has(api)) {
        return this.apiInstances.get(api)
      }
      if (api in registeredAPIs) {
        return this.initializeAPI(registeredAPIs[api])
      }
      return null
    } else if (typeof api === 'function') {
      const apiName = getModuleName(api)

      // if it has a name, use that indirection to find in the instance's map
      if (apiName !== null) {
        if (this.apiInstances.has(apiName)) {
          return this.apiInstances.get(apiName)
        }

        // If we don't have a local instance, create the instance of the component
        return this.initializeAPI(api)
      }
    }

    throw Object.assign(new Error('Cannot get instance of the specified component'), { api })
  }

  /**
   * This method unmounts all the components and releases the Worker
   */
  unmount() {
    if (this.unmounted) return
    this.notify('SIGKILL')

    this.emit(RpcHostEvents.systemWillUnmount)

    try {
      this.apiInstances.forEach(PrivateHelpers.unmountAPI)
      this.apiInstances.clear()
    } catch (e) {
      this.emit('error', e)
    }

    this.transport.close()

    this.emit(RpcHostEvents.systemDidUnmount)

    this.unmounted = true
  }

  protected initializeAPI<X extends ExposableModule>(ctor: {
    new (options: ExposableModuleOptions): X
    factory?(ctor: { new (options: ExposableModuleOptions): X }, options: ExposableModuleOptions): X
  }): X {
    const apiName = getModuleName(ctor)

    if (apiName === null) {
      throw new Error('The plugin is not registered')
    }

    if (this.apiInstances.has(apiName)) {
      return this.apiInstances.get(apiName) as X
    }

    const apiOptions: ExposableModuleOptions = {
      apiName,
      on: (event, handler) => this.on(`${apiName}.${event}`, handler),
      notify: (event, params?) => this.notify(`${apiName}.${event}`, params),
      expose: (event, handler) => this.expose(`${apiName}.${event}`, handler),
      getExposedModuleInstance: (name: any) => {
        // tslint:disable-next-line
        return this.getExposedModuleInstance(name) as any
      },
      system: this
    }

    const instance = ctor.factory ? ctor.factory(ctor, apiOptions) : new ctor(apiOptions)

    this.apiInstances.set(apiName, instance)

    if (this.isEnabled) {
      PrivateHelpers.mountAPI(instance)
    }

    return instance
  }

  /**
   * Preloads a list of components
   */
  private async RPCLoadModules(apiNames: string[]) {
    // tslint:disable-next-line
    if (typeof apiNames !== 'object' || !(apiNames instanceof Array)) {
      throw new TypeError('RPCLoadComponents(names) name must be an array of strings')
    }

    const notFound = apiNames
      .map(name => ({ api: this.getExposedModuleInstance(name), name }))
      .filter($ => $.api === null)
      .map($ => $.name)

    if (notFound.length) {
      const message = `These modules are not exposed: ${notFound.join(',')}`
      throw new TypeError(message)
    }
  }
}
