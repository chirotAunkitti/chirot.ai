import { NextRequest, NextResponse } from 'next/server';

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
        chunks: [],
        totalChunks,
        fileName,
        mimeType
      });
    }

    const storage = chunkStorage.get(sessionId)!;
    storage.chunks[chunkIndex] = buffer;

    // ตรวจสอบว่าทุก chunks มาครบแล้วหรือยัง
    const allChunksReceived = storage.chunks.length === totalChunks && 
                               storage.chunks.every(chunk => chunk !== undefined);

    if (allChunksReceived) {
      // รวม chunks เป็นไฟล์เดียว
      const completeFile = Buffer.concat(storage.chunks);
      
      // เก็บไฟล์รวมไว้ใน storage
      storage.chunks = [completeFile]; // เก็บเป็นไฟล์เดียว
      
      return NextResponse.json({
        success: true,
        complete: true,
        message: 'All chunks received and merged',
        sessionId
      });
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

