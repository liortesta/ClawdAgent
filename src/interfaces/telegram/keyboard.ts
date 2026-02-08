import { InlineKeyboard } from 'grammy';

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🖥️ Servers', 'menu:servers').text('📋 Tasks', 'menu:tasks').row()
    .text('💻 Code', 'menu:code').text('🔍 Search', 'menu:search').row()
    .text('⚙️ Settings', 'menu:settings');
}

export function confirmKeyboard(action: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Yes', `confirm:${action}`)
    .text('❌ No', `cancel:${action}`);
}

export function taskStatusKeyboard(taskId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('▶️ Start', `task:start:${taskId}`)
    .text('✅ Done', `task:done:${taskId}`)
    .text('🗑️ Delete', `task:delete:${taskId}`);
}
