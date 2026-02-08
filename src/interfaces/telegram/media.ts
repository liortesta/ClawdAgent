import logger from '../../utils/logger.js';

export async function handleVoiceMessage(_fileId: string): Promise<string> {
  logger.info('Voice message received — transcription not yet implemented');
  return 'Voice message received. Transcription coming soon.';
}

export async function handleDocument(fileId: string, fileName: string): Promise<{ name: string; content: string }> {
  logger.info('Document received', { fileId, fileName });
  return { name: fileName, content: 'Document processing coming soon.' };
}
