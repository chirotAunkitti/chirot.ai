import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { chunkStorage } from '../upload-chunk/route';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get('sessionId') as string;
    const customPrompt = formData.get('prompt') as string;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    // ดึงไฟล์รวมจาก storage
    const storage = chunkStorage.get(sessionId);
    if (!storage || storage.chunks.length === 0) {
      return NextResponse.json(
        { error: 'File not found or not complete' },
        { status: 404 }
      );
    }

    const completeFile = storage.chunks[0];
    const fileName = storage.fileName;
    const mimeType = storage.mimeType;

    // ใช้ prompt ที่ผู้ใช้ส่งมา หรือใช้ default prompt
    const prompt = customPrompt || `คุณเป็นผู้เชี่ยวชาญในการประมวลผลเสียง กรุณาวิเคราะห์ไฟล์เสียงนี้และให้คำแนะนำหรือข้อมูลเกี่ยวกับการถอนเสียง (vocal removal) จากไฟล์เสียงนี้`;

    // แปลง buffer เป็น base64
    const base64Audio = completeFile.toString('base64');

    // เริ่มต้น Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ไม่พบ API Key' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // ใช้ model ที่รองรับ audio transcription
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'models/gemini-2.5-flash',
      'models/gemini-2.5-pro',
      'models/gemini-1.5-flash',
      'models/gemini-1.5-pro'
    ];
    
    let text = '';
    let lastError: any = null;
    let successfulModel = '';

    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying model: ${modelName}`);
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
        successfulModel = modelName;
        console.log(`✅ Success with model: ${modelName}, text length: ${text.length}`);
        break;
      } catch (err: any) {
        lastError = err;
        const errorMsg = err?.message || err?.toString() || 'Unknown error';
        console.log(`❌ Model ${modelName} failed: ${errorMsg.substring(0, 200)}`);
        continue;
      }
    }

    if (!text || text.trim().length === 0) {
      const errorMessage = lastError?.message || lastError?.toString() || 'Unknown error';
      throw new Error(
        `ไม่สามารถประมวลผลเสียงได้\n\nError: ${errorMessage}`
      );
    }

    // ลบไฟล์จาก storage หลังจากประมวลผลเสร็จ
    chunkStorage.delete(sessionId);

    return NextResponse.json({
      success: true,
      message: 'ประมวลผลเสร็จสิ้น',
      result: text,
      fileName: fileName,
      fileSize: completeFile.length,
      fileType: mimeType,
    });
  } catch (error: any) {
    console.error('Error processing audio:', error);
    return NextResponse.json(
      { 
        error: 'เกิดข้อผิดพลาดในการประมวลผล',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

