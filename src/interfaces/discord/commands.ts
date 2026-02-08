import { SlashCommandBuilder } from 'discord.js';

export const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Show all commands'),
  new SlashCommandBuilder().setName('status').setDescription('Show bot status'),
  new SlashCommandBuilder().setName('tasks').setDescription('List your tasks'),
  new SlashCommandBuilder().setName('search').setDescription('Search the web').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
  new SlashCommandBuilder().setName('ask').setDescription('Ask a question').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
];
