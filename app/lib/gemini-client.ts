// Client-side Gemini API client
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function processAudioWithGemini(
  audioFile: File,
  prompt: string,
  apiKey: string
) {
  // ตรวจสอบประเภทไฟล์
  const allowedTypes = [
    'audio/mpeg',
    'audio/wav',
    'audio/mp3',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a'
  ];

  const fileExtension = audioFile.name.toLowerCase().split('.').pop();
  const isAllowedType = allowedTypes.includes(audioFile.type) || fileExtension === 'm4a';

  if (!isAllowedType) {
    throw new Error('ประเภทไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์เสียง (MP3, WAV, OGG, WebM, M4A)');
  }

  // อ่านไฟล์เป็น base64
  const arrayBuffer = await audioFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Audio = btoa(binary);

  // กำหนด MIME type
  let mimeType = audioFile.type;
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (fileExtension === 'm4a') {
      mimeType = 'audio/mp4';
    } else if (fileExtension === 'mp3') {
      mimeType = 'audio/mpeg';
    } else if (fileExtension === 'wav') {
      mimeType = 'audio/wav';
    } else if (fileExtension === 'ogg') {
      mimeType = 'audio/ogg';
    } else if (fileExtension === 'webm') {
      mimeType = 'audio/webm';
    }
  }

  // เริ่มต้น Gemini API
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  let text = '';
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          },
        },
        prompt,
      ]);

      const response = await result.response;

      if (!response) {
        throw new Error('Response is empty');
      }

      const responseText = response.text();

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Response text is empty');
      }

      text = responseText;
      break;
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  if (!text || text.trim().length === 0) {
    const errorMessage = lastError?.message || lastError?.toString() || 'Unknown error';
    throw new Error(
      `ไม่สามารถประมวลผลเสียงได้\n\nError: ${errorMessage}\n\n` +
      `วิธีแก้ไข:\n` +
      `- ตรวจสอบ API key ที่ https://makersuite.google.com/app/apikey\n` +
      `- ลองใช้ไฟล์เสียงอื่น\n` +
      `- ตรวจสอบว่า API key มี quota เหลือ`
    );
  }

  return {
    success: true,
    message: 'ประมวลผลเสร็จสิ้น',
    result: text,
    fileName: audioFile.name,
    fileSize: audioFile.size,
    fileType: mimeType,
  };
}

