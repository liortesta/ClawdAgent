import { EmbedBuilder } from 'discord.js';

export function createStatusEmbed(uptime: string, memory: string) {
  return new EmbedBuilder()
    .setTitle('📊 ClawdAgent Status')
    .setColor(0x00FF00)
    .addFields(
      { name: 'Status', value: '✅ Online', inline: true },
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Memory', value: memory, inline: true },
    )
    .setTimestamp();
}

export function createTaskEmbed(title: string, status: string, priority: string, dueDate?: string) {
  return new EmbedBuilder()
    .setTitle(`📋 ${title}`)
    .setColor(priority === 'p0' ? 0xFF0000 : priority === 'p1' ? 0xFF8800 : 0x00FF00)
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Priority', value: priority.toUpperCase(), inline: true },
      ...(dueDate ? [{ name: 'Due', value: dueDate, inline: true }] : []),
    );
}
