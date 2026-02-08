type MessageHandler = (data: any) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(token: string) {
    this.ws = new WebSocket(`ws://${window.location.host}/ws?token=${token}`);
    this.ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      this.handlers.get(type)?.forEach(h => h(data));
    };
    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(token), 3000);
    };
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  send(text: string) {
    this.ws?.send(JSON.stringify({ text }));
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
