import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 10; // Vercel Free tier limit

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const prompt = formData.get('prompt') as string;
    const segmentIndex = parseInt(formData.get('segmentIndex') as string || '0');
    const totalSegments = parseInt(formData.get('totalSegments') as string || '1');

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Missing audio file' },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }

    // อ่านไฟล์เป็น buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Audio = buffer.toString('base64');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ไม่พบ API Key' },
        { status: 500 }
      );
    }

    // สร้าง prompt สำหรับ segment นี้
    const segmentPrompt = totalSegments > 1 
      ? `${prompt}\n\nหมายเหตุ: นี่เป็นส่วนที่ ${segmentIndex + 1} จากทั้งหมด ${totalSegments} ส่วนของไฟล์เสียง กรุณาถอดเสียงส่วนนี้เท่านั้น`
      : prompt;

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
              mimeType: audioFile.type || 'audio/mp4',
            },
          },
          segmentPrompt,
        ]);

        const response = await result.response;
        if (response) {
          const responseText = response.text();
          if (responseText && responseText.trim().length > 0) {
            text = responseText;
            break;
          }
        }
      } catch (err: any) {
        lastError = err;
        continue;
      }
    }

    if (!text) {
      return NextResponse.json(
        { 
          error: 'ไม่สามารถประมวลผลเสียงได้',
          details: lastError?.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      text: text,
      segmentIndex: segmentIndex,
      totalSegments: totalSegments,
    });
  } catch (error: any) {
    console.error('Error processing segment:', error);
    return NextResponse.json(
      { 
        error: 'เกิดข้อผิดพลาดในการประมวลผล',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

