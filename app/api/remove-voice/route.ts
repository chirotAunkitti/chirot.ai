import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ตั้งค่า runtime และ body size limit
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes สำหรับ Vercel Pro, 10s สำหรับ Free tier

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const customPrompt = formData.get('prompt') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'ไม่มีไฟล์เสียงที่อัปโหลด' },
        { status: 400 }
      );
    }

    // ตรวจสอบขนาดไฟล์ (90MB limit)
    const maxSize = 90 * 1024 * 1024; // 90MB
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { 
          error: `ไฟล์ใหญ่เกินไป! ขนาดสูงสุดที่รองรับ: 90MB (ไฟล์ของคุณ: ${(audioFile.size / 1024 / 1024).toFixed(2)} MB)`,
          fileSize: audioFile.size,
          maxSize: maxSize
        },
        { status: 413 }
      );
    }

    // ใช้ prompt ที่ผู้ใช้ส่งมา หรือใช้ default prompt
    const prompt = customPrompt || `คุณเป็นผู้เชี่ยวชาญในการประมวลผลเสียง กรุณาวิเคราะห์ไฟล์เสียงนี้และให้คำแนะนำหรือข้อมูลเกี่ยวกับการถอนเสียง (vocal removal) จากไฟล์เสียงนี้`;

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
    
    // ตรวจสอบประเภทไฟล์หรือนามสกุลไฟล์
    const fileExtension = audioFile.name.toLowerCase().split('.').pop();
    const isAllowedType = allowedTypes.includes(audioFile.type) || fileExtension === 'm4a';
    
    if (!isAllowedType) {
      return NextResponse.json(
        { error: 'ประเภทไฟล์ไม่รองรับ กรุณาอัปโหลดไฟล์เสียง (MP3, WAV, OGG, WebM, M4A)' },
        { status: 400 }
      );
    }

    // อ่านไฟล์เป็น base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    // กำหนด MIME type ที่ถูกต้องสำหรับ M4A
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ไม่พบ API Key' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // ใช้ model ที่รองรับ audio transcription ดีที่สุด
    // gemini-2.5-flash เป็น model หลักสำหรับการถอดเสียง (transcription) - รวดเร็วและรองรับ Audio
    // gemini-2.5-pro เป็นทางเลือกสำหรับความแม่นยำสูงสุด
    const modelsToTry = [
      'gemini-2.5-flash',             // Model หลัก - รองรับ Audio transcription ดีและรวดเร็ว
      'gemini-2.5-pro',               // ทางเลือก - ความแม่นยำสูงสุด
      'gemini-1.5-flash',             // Fallback - Model เวอร์ชันเก่า
      'gemini-1.5-pro',               // Fallback - Model เวอร์ชันเก่า
      'gemini-pro',                   // Fallback - Model พื้นฐาน
      'models/gemini-2.5-flash',      // บางครั้งต้องมี prefix
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
        
        // ส่งคำขอไปยัง Gemini
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
        
        // ตรวจสอบว่า response มีข้อมูล
        if (!response) {
          throw new Error('Response is empty');
        }
        
        // ดึงข้อความจาก response
        const responseText = response.text();
        
        // ตรวจสอบว่าข้อความไม่ว่าง
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Response text is empty');
        }
        
        text = responseText;
        successfulModel = modelName;
        console.log(`✅ Success with model: ${modelName}, text length: ${text.length}`);
        break; // สำเร็จแล้ว ออกจาก loop
      } catch (err: any) {
        lastError = err;
        const errorMsg = err?.message || err?.toString() || 'Unknown error';
        console.log(`❌ Model ${modelName} failed: ${errorMsg.substring(0, 200)}`);
        // Log full error for debugging
        if (err?.stack) {
          console.error(`Full error for ${modelName}:`, err.stack);
        }
        continue; // ลอง model ถัดไป
      }
    }

    if (!text || text.trim().length === 0) {
      // ถ้า model ทั้งหมดไม่ทำงาน หรือ response ว่าง
      const errorMessage = lastError?.message || lastError?.toString() || 'Unknown error';
      console.error('All models failed or returned empty response. Last error:', errorMessage);
      console.error('Last error details:', JSON.stringify(lastError, null, 2));
      
      // ตรวจสอบว่าเป็นปัญหา response ว่างหรือไม่
      const isEmptyResponse = lastError?.message?.includes('empty') || 
                             lastError?.message?.includes('Response');
      
      throw new Error(
        `ไม่สามารถประมวลผลเสียงได้\n\n` +
        `${isEmptyResponse ? '⚠️ Response จาก AI ว่างเปล่า - อาจเป็นเพราะ:\n' : 'สาเหตุที่เป็นไปได้:\n'}` +
        `${isEmptyResponse ? '1. ไฟล์เสียงอาจมีปัญหา\n' : '1. API key อาจไม่มีสิทธิ์เข้าถึง model ที่ต้องการ\n'}` +
        `${isEmptyResponse ? '2. Prompt อาจไม่เหมาะสม\n' : '2. API key อาจเป็นเวอร์ชันเก่าที่ไม่รองรับ model ใหม่\n'}` +
        `${isEmptyResponse ? '3. Model อาจไม่สามารถประมวลผลไฟล์นี้ได้\n' : '3. Model อาจไม่รองรับ audio input ในรูปแบบนี้\n'}` +
        `4. ตรวจสอบว่า API key ถูกต้องและมี quota เหลือ\n\n` +
        `Error: ${errorMessage}\n\n` +
        `วิธีแก้ไข:\n` +
        `- ลองใช้ไฟล์เสียงอื่น\n` +
        `- ตรวจสอบ API key ที่ https://makersuite.google.com/app/apikey\n` +
        `- ลองสร้าง API key ใหม่\n` +
        `- ตรวจสอบว่า API key มีสิทธิ์เข้าถึง Gemini API`
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ประมวลผลเสร็จสิ้น',
      result: text,
      fileName: audioFile.name,
      fileSize: audioFile.size,
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

