export type Platform = 'telegram' | 'discord' | 'whatsapp' | 'web';

export function formatResponse(text: string, platform: Platform): string {
  switch (platform) {
    case 'telegram':
      return formatForTelegram(text);
    case 'discord':
      return formatForDiscord(text);
    case 'whatsapp':
      return formatForWhatsApp(text);
    case 'web':
      return text; // Web supports full markdown
    default:
      return text;
  }
}

function formatForTelegram(text: string): string {
  // Telegram supports basic Markdown
  return text
    .replace(/^### (.+)$/gm, '*$1*')
    .replace(/^## (.+)$/gm, '*$1*')
    .replace(/^# (.+)$/gm, '*$1*');
}

function formatForDiscord(text: string): string {
  // Discord supports full markdown + embeds
  return text;
}

function formatForWhatsApp(text: string): string {
  // WhatsApp has limited formatting
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')     // Bold
    .replace(/~~(.+?)~~/g, '~$1~')          // Strikethrough
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '```$1```')  // Code blocks
    .replace(/#{1,3} (.+)/g, '*$1*');        // Headers -> bold
}

export function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen / 2) idx = remaining.lastIndexOf(' ', maxLen);
    if (idx === -1) idx = maxLen;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}
