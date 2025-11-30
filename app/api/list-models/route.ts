import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ไม่พบ API Key' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ลอง list models ที่มีอยู่
    // หมายเหตุ: SDK อาจไม่มี method listModels โดยตรง
    // แต่เราสามารถลองใช้ model ต่างๆ เพื่อดูว่าตัวไหนทำงาน
    
    const modelsToTest = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'models/gemini-pro',
      'models/gemini-1.5-pro',
      'models/gemini-1.5-flash'
    ];

    const results: any[] = [];

    for (const modelName of modelsToTest) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        // ลอง generate content แบบง่ายๆ เพื่อดูว่า model ทำงานหรือไม่
        const result = await model.generateContent('test');
        await result.response;
        results.push({ model: modelName, status: 'available' });
      } catch (err: any) {
        results.push({ 
          model: modelName, 
          status: 'unavailable', 
          error: err.message 
        });
      }
    }

    return NextResponse.json({
      success: true,
      models: results,
      apiKey: apiKey.substring(0, 10) + '...' // แสดงแค่ส่วนแรกของ API key
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: 'เกิดข้อผิดพลาด',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

