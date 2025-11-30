import { NextResponse } from 'next/server';

// API endpoint ที่ส่ง API key กลับมา (สำหรับ client-side processing)
// หมายเหตุ: ใน production ควรมี rate limiting และ authentication
export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ไม่พบ API Key' },
        { status: 500 }
      );
    }

    // ส่ง API key กลับไป (ใน production ควรมี security measures เพิ่มเติม)
    return NextResponse.json({
      success: true,
      apiKey: apiKey,
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

