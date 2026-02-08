export const taskTemplates = {
  bug: { title: 'Fix: ', priority: 'p1', tags: ['bug'] },
  feature: { title: 'Feature: ', priority: 'p2', tags: ['feature'] },
  chore: { title: 'Chore: ', priority: 'p3', tags: ['chore'] },
  urgent: { title: 'URGENT: ', priority: 'p0', tags: ['urgent'] },
};

export function applyTemplate(templateName: keyof typeof taskTemplates, title: string) {
  const template = taskTemplates[templateName];
  return { title: template.title + title, priority: template.priority, tags: template.tags };
}
