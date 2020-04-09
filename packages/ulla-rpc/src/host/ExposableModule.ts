import { hasOwnSymbol } from '../common/core/SymbolShim'

// If there is no native Symbol
// nor polyfill, then a plain number is used for performance.
// tslint:disable-next-line
const hasSymbol = typeof Symbol === 'function' && Symbol.for

const exposedMethodSymbol = hasSymbol ? Symbol('exposedMethod') : 0xfea1

export function exposeProcedure<T extends ExposableModule>(
  target: T,
  propertyKey: keyof T,
  descriptor: TypedPropertyDescriptor<ExposableMethod>
) {
  const anyTarget: any = target
  if (!hasOwnSymbol(target, exposedMethodSymbol)) {
    anyTarget[exposedMethodSymbol] = new Set()
  }

  anyTarget[exposedMethodSymbol].add(propertyKey)
}

export function getExposedProcedures<T extends ExposableModule>(instance: T): Set<keyof T> {
  const result = new Set<keyof T>()
  let currentPrototype = Object.getPrototypeOf(instance)

  while (!!currentPrototype) {
    if (hasOwnSymbol(currentPrototype, exposedMethodSymbol)) {
      const currentList: Set<string> = currentPrototype[exposedMethodSymbol]
      currentList.forEach($ => result.add($ as any))
    }
    currentPrototype = Object.getPrototypeOf(currentPrototype)
  }

  return result
}

export type ExposableModuleOptions = {
  apiName: string
  system: any
  on(event: string, handler: <A, O extends object>(params: Array<A> | O) => void): void
  notify(event: string, params?: Object | Array<any>): void
  expose(event: string, handler: <A, O extends object>(params: Array<A> | O) => Promise<any>): void
  getExposedModuleInstance<X>(component: { new (options: ExposableModuleOptions): X }): X
  getExposedModuleInstance(name: string): ExposableModule | null
}

export type ExposedModuleClass<T> = {
  new (options: ExposableModuleOptions): T
}

export type ExposableMethod = (...args: any[]) => Promise<any>

// we use an interface here because it is mergable with the class
export interface ExposableModule {
  apiDidMount?(): Promise<void> | void
  apiWillUnmount?(): Promise<void> | void
}

/**
 * This pattern bears resemblance to the Gang of Four’s Strategy pattern.
 * Both patterns are about taking part of an object’s behavior and delegating
 * it to a separate subordinate object. The difference is that with the Strategy
 * pattern, the separate “strategy” object is usually stateless—it encapsulates
 * an algorithm, but no data. It defines how an object behaves, but not what it is.
 *
 * http://wiki.c2.com/?StrategyPattern
 *
 * ExposedModules are a bit more self-important. They often hold state that describes
 * the object and helps define its actual identity. However, the line may blur.
 * You may have some ExposedModules that don’t need any local state. In that case,
 * you’re free to use the same component instance across multiple container objects.
 * At that point, it really is behaving more akin to a strategy.
 *
 * ExposedModules are located via service locators managed by the RpcHost
 *
 * An ExposableModule class defines an abstract interface to a set of operations.
 * That interface is exposed via @exposeProcedure decorator. A concrete service
 * provider implements this interface. A separate service locator (RpcHost)
 * provides access to the service by finding an appropriate provider while hiding
 * both the provider’s concrete type and implementation and the process used to
 * locate it.
 */
export abstract class ExposableModule {
  static expose = exposeProcedure

  constructor(protected options: ExposableModuleOptions) {
    for (let methodName of getExposedProcedures(this)) {
      const theMethod: any = this[methodName]
      if (typeof theMethod === 'function') {
        if (typeof methodName === 'string') {
          this.options.expose(methodName, theMethod.bind(this))
        }
      }
    }
  }

  static factory(ctor: ExposedModuleClass<ExposableModule>, options: ExposableModuleOptions) {
    return new ctor(options)
  }
}

export abstract class SubscribableModule extends ExposableModule {
  abstract async subscribe(event: string): Promise<void>
}

export interface ISubscribableModule {
  subscribe(event: string): Promise<void>
  unsubscribe(event: string): Promise<void>
  onSubscribedEvent(fn: (data: any) => void): void
}
