import { readFile } from 'fs/promises';
import logger from '../../utils/logger.js';

export async function extractText(filePath: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'ts':
    case 'js':
    case 'py':
      return readFile(filePath, 'utf-8');

    case 'pdf': {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = await readFile(filePath);
        const data = await pdfParse(buffer);
        return data.text;
      } catch (err: any) {
        logger.warn('pdf-parse failed', { error: err.message });
        throw new Error('Cannot extract text from PDF. Install pdf-parse.');
      }
    }

    case 'docx': {
      const mammoth = await import('mammoth');
      const buffer = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case 'xlsx':
    case 'xls': {
      const XLSX = await import('xlsx');
      const buffer = await readFile(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const texts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        texts.push(`## Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`);
      }
      return texts.join('\n\n');
    }

    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}
