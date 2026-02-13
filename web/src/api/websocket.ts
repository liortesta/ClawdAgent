type MessageHandler = (data: any) => void;
type StatusHandler = (connected: boolean) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private statusHandlers: StatusHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private intentionalClose = false;
  private authenticated = false;

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    this.authenticated = false;
    this.doConnect();
  }

  private doConnect() {
    if (!this.token) return;

    try {
      // Connect without token in URL (secure — token sent via message)
      this.ws = new WebSocket(`ws://${window.location.host}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Send auth message instead of token in query string
      this.ws!.send(JSON.stringify({ type: 'auth', token: this.token }));
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        // Handle auth response
        if (type === 'auth' && data?.ok) {
          this.authenticated = true;
          this.statusHandlers.forEach(h => h(true));
          return;
        }

        this.handlers.get(type)?.forEach(h => h(data));
      } catch { /* malformed message */ }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose, so we handle reconnect there
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.statusHandlers.forEach(h => h(false));
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler);
  }

  send(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(JSON.stringify({ text }));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  cancel() {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(JSON.stringify({ type: 'cancel' }));
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.authenticated = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
