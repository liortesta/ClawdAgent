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
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000; // 30 seconds max

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
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
          this.reconnectAttempts = 0; // Reset backoff on successful auth
          this.statusHandlers.forEach(h => h(true));
          return;
        }

        // Handle recovered messages (responses computed while disconnected)
        if (type === 'recovered_message') {
          this.handlers.get('message')?.forEach(h => h(data));
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
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler);
  }

  send(text: string, conversationId?: string, responseMode?: string, model?: string) {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(JSON.stringify({ text, conversationId, responseMode, model }));
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
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
