import { Engine, IncomingMessage, OutgoingMessage } from '../core/engine.js';

export abstract class BaseInterface {
  abstract name: string;
  protected engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  protected async processMessage(incoming: IncomingMessage): Promise<OutgoingMessage> {
    return this.engine.process(incoming);
  }
}
