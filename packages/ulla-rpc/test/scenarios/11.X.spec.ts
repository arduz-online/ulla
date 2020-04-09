import { EventDispatcher, EventDispatcherBinding } from '../../lib/common/core/EventDispatcher'
import { exposeProcedure, SubscribableModule, registerModule, ExposableModuleOptions } from '../../lib/host'
import { testInWorker } from './support/Helpers'
import * as assert from 'assert'

class EventListener extends EventDispatcher {
  count: number = 0

  constructor() {
    super()
    const evt = new CustomEvent('customEvent', { detail: 'test' })

    self.addEventListener('customEvent', e => {
      this.handleEvent(e.type, (e as CustomEvent).detail)
    })

    this.on('customEvent', () => {
      this.count++
    })

    setInterval(() => {
      self.dispatchEvent(evt)
    }, 100)
  }

  handleEvent(type: string, detail?: string) {
    this.emit(type, detail ? { data: { message: detail } } : {})
  }

  validateCount(value: number) {
    if (this.count <= value) {
      assert.fail(`EventListener's binding must not be removed`)
    }
  }
}

@registerModule('eventController')
export class EventController extends SubscribableModule {
  private listener: EventListener
  private bindings: EventDispatcherBinding[] = []

  constructor(opts: ExposableModuleOptions) {
    super(opts)
    this.listener = new EventListener()

    this.options.on('Validate', (data: any) => {
      this.listener.validateCount(data.value)
    })
  }

  @exposeProcedure
  async setCount(count: number) {
    this.listener.count = 0
  }

  @exposeProcedure
  async subscribe(event: string) {
    const binding = this.listener.on(event, (e: any) => {
      this.options.notify('SubscribedEvent', { event, data: e.data })
    })

    this.bindings.push(binding)
  }

  @exposeProcedure
  async unsubscribe(event: string) {
    this.bindings.filter(binding => binding.event === event).forEach(binding => binding.off())
  }
}

describe('EventDispatcher', function() {
  testInWorker('test/out/fixtures/11.1.EventSubscriber.js', {
    plugins: [EventController],
    log: false
  })

  testInWorker('test/out/fixtures/11.2.ComplexEventSubscriber.js', {
    plugins: [EventController],
    log: false
  })
})
