import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// เก็บ chunks ใน memory (สำหรับ Vercel Free tier)
// หมายเหตุ: ใน production ควรใช้ Redis หรือ database
export const chunkStorage = new Map<string, { chunks: Buffer[], totalChunks: number, fileName: string, mimeType: string }>();

export const runtime = 'nodejs';
export const maxDuration = 10; // Vercel Free tier limit

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const chunkIndexStr = formData.get('chunkIndex') as string;
    const totalChunksStr = formData.get('totalChunks') as string;
    const sessionId = formData.get('sessionId') as string;
    const fileName = formData.get('fileName') as string;
    const mimeType = formData.get('mimeType') as string;

    // Validate required fields
    if (!chunk || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: chunk or sessionId' },
        { status: 400 }
      );
    }

    if (!chunkIndexStr || !totalChunksStr) {
      return NextResponse.json(
        { error: 'Missing required fields: chunkIndex or totalChunks' },
        { status: 400 }
      );
    }

    const chunkIndex = parseInt(chunkIndexStr);
    const totalChunks = parseInt(totalChunksStr);
    const prompt = formData.get('prompt') as string;
    const processImmediately = formData.get('processImmediately') === 'true';

    if (isNaN(chunkIndex) || isNaN(totalChunks)) {
      return NextResponse.json(
        { error: 'Invalid chunkIndex or totalChunks' },
        { status: 400 }
      );
    }

    // ตรวจสอบขนาด chunk (ไม่เกิน 4MB)
    const maxChunkSize = 4 * 1024 * 1024; // 4MB
    if (chunk.size > maxChunkSize) {
      return NextResponse.json(
        { error: `Chunk size too large: ${(chunk.size / 1024 / 1024).toFixed(2)}MB (max: 4MB)` },
        { status: 413 }
      );
    }

    // อ่าน chunk เป็น buffer
    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // เก็บ chunk
    if (!chunkStorage.has(sessionId)) {
      chunkStorage.set(sessionId, {
        chunks: new Array(totalChunks),
        totalChunks,
        fileName: fileName || 'audio',
        mimeType: mimeType || 'audio/mp4'
      });
    }

    const storage = chunkStorage.get(sessionId);
    if (!storage) {
      return NextResponse.json(
        { error: 'Failed to get storage' },
        { status: 500 }
      );
    }

    // ตรวจสอบว่า chunks array ถูกสร้างแล้ว
    if (!storage.chunks || !Array.isArray(storage.chunks)) {
      storage.chunks = new Array(totalChunks);
    }

    storage.chunks[chunkIndex] = buffer;

    // ตรวจสอบว่าทุก chunks มาครบแล้วหรือยัง
    const receivedChunks = storage.chunks.filter(c => c !== undefined && c !== null);
    const allChunksReceived = receivedChunks.length === totalChunks;

    console.log(`Chunk ${chunkIndex + 1}/${totalChunks} received. Total received: ${receivedChunks.length}/${totalChunks}`);

    if (allChunksReceived) {
      console.log('All chunks received, merging and processing...');
      // รวม chunks เป็นไฟล์เดียว (กรอง undefined/null ออก)
      const validChunks = storage.chunks.filter(c => c !== undefined && c !== null) as Buffer[];
      if (validChunks.length !== totalChunks) {
        return NextResponse.json(
          { error: `Missing chunks: received ${validChunks.length} of ${totalChunks}` },
          { status: 400 }
        );
      }
      const completeFile = Buffer.concat(validChunks);
      
      // ถ้าต้องการประมวลผลทันที (chunk สุดท้าย)
      if (processImmediately && prompt) {
        try {
          // ประมวลผลทันทีใน invocation เดียวกัน
          const base64Audio = completeFile.toString('base64');
          const apiKey = process.env.GEMINI_API_KEY;
          
          if (!apiKey) {
            return NextResponse.json(
              { error: 'ไม่พบ API Key' },
              { status: 500 }
            );
          }

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
                    mimeType: storage.mimeType || 'audio/mp4',
                  },
                },
                prompt,
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
            throw new Error(lastError?.message || 'ไม่สามารถประมวลผลเสียงได้');
          }

          // ลบไฟล์จาก storage
          chunkStorage.delete(sessionId);

          return NextResponse.json({
            success: true,
            complete: true,
            message: 'ประมวลผลเสร็จสิ้น',
            result: text,
            fileName: storage.fileName,
            fileSize: completeFile.length,
            fileType: storage.mimeType,
          });
        } catch (error: any) {
          console.error('Error processing audio:', error);
          // ลบไฟล์จาก storage
          chunkStorage.delete(sessionId);
          return NextResponse.json(
            { 
              error: 'เกิดข้อผิดพลาดในการประมวลผล',
              details: error.message 
            },
            { status: 500 }
          );
        }
      } else {
        // เก็บไฟล์รวมไว้ใน storage (สำหรับกรณีไม่ประมวลผลทันที)
        storage.chunks = [completeFile];
        
        return NextResponse.json({
          success: true,
          complete: true,
          message: 'All chunks received and merged',
          sessionId
        });
      }
    }

    return NextResponse.json({
      success: true,
      complete: false,
      received: storage.chunks.filter(c => c !== undefined).length,
      total: totalChunks,
      sessionId
    });
  } catch (error: any) {
    console.error('Error uploading chunk:', error);
    return NextResponse.json(
      { error: 'Failed to upload chunk', details: error.message },
      { status: 500 }
    );
  }
}

// API สำหรับดึงไฟล์รวม
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    const storage = chunkStorage.get(sessionId);
    if (!storage || storage.chunks.length === 0) {
      return NextResponse.json(
        { error: 'File not found or not complete' },
        { status: 404 }
      );
    }

    // ส่งไฟล์กลับ
    return new NextResponse(storage.chunks[0] as any, {
      headers: {
        'Content-Type': storage.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${storage.fileName}"`,
      },
    });
  } catch (error: any) {
    console.error('Error getting file:', error);
    return NextResponse.json(
      { error: 'Failed to get file', details: error.message },
      { status: 500 }
    );
  }
}

// API สำหรับลบไฟล์ (cleanup)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      chunkStorage.delete(sessionId);
    } else {
      // ลบไฟล์เก่าทั้งหมด (cleanup)
      const now = Date.now();
      // ใน production ควรมี TTL mechanism
      chunkStorage.clear();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file', details: error.message },
      { status: 500 }
    );
  }
}

