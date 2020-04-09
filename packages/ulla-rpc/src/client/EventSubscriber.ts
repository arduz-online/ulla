import { EventDispatcher, EventDispatcherBinding } from '../common/core/EventDispatcher'
import { ISubscribableModule } from '../host/ExposableModule'

export class EventSubscriber extends EventDispatcher {
  constructor(private module: ISubscribableModule) {
    super()

    module.onSubscribedEvent((data: any) => {
      super.emit(data.event, data)
    })
  }

  /**
   * Registers a new listener for an specific event.
   * @param event The name of the event
   * @param handler A handler which be called each time the event is received
   */
  on(event: string, callback: (...args: any[]) => void, once?: boolean): EventDispatcherBinding
  on(event: string, callback: any, once?: boolean): EventDispatcherBinding
  on(event: string, handler: any) {
    if (this.getEventBindings(event).length === 0) {
      this.module.subscribe(event).catch(e => this.emit('error', e))
    }
    return super.on.apply(this, arguments as any)
  }

  /**
   * Removes a listener for an specific event
   * @param event The name of the event
   * @param binding A reference to a binding returned by a previous `addEventListener` call
   */
  off(event: string | EventDispatcherBinding | Function) {
    let theEventToValidate: string | null = null
    const offResult = super.off.apply(this, arguments as any)

    if (typeof event === 'string') {
      theEventToValidate = event
    } else if (event instanceof EventDispatcherBinding) {
      event = event.event
    }

    if (theEventToValidate !== null) {
      if (this.getEventBindings(theEventToValidate).length === 0) {
        // If we are removing the last event listener, remove it also from the module
        // this will keep listeners unrelated to the module intact

        this.module.unsubscribe(theEventToValidate).catch(e => this.emit('error', e))
      }
    }

    return offResult
  }
}
