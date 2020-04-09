import { Server } from '../common/json-rpc/Server'
import { IServerOpts, RpcTransport } from '../common/json-rpc/types'

export class TransportBasedServer extends Server<RpcTransport> {
  constructor(public transport: RpcTransport, opt: IServerOpts = {}) {
    super(opt)

    if (!this.transport) {
      throw new TypeError('transport cannot be undefined or null')
    }

    this.transport.onMessage(msg => {
      this.processMessage(this.transport, msg)
    })

    if (this.transport.onError) {
      this.transport.onError(err => this.emit('error', err))
    }

    if (this.transport.onClose) {
      this.transport.onClose(() => this.disable())
    }
  }

  sendMessage(receiver: RpcTransport, message: string) {
    receiver.sendMessage(message)
  }

  getAllClients() {
    return [this.transport]
  }
}
