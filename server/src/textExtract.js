import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export async function extractTextFromFile(file) {
  const ext = file.originalname.split('.').pop()?.toLowerCase();

  if (ext === 'txt') {
    return file.buffer.toString('utf-8');
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
