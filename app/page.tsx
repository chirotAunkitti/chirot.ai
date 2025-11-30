'use client';

import { useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Waveform Animation Component
const WaveformLoader = () => {
  const bars = Array.from({ length: 25 }, (_, i) => {
    // สร้าง gradient จากสีอ่อนไปเข้ม
    const baseHeight = 30;
    const variation = Math.sin(i * 0.4) * 40;
    const height = baseHeight + variation;
    return { id: i, height };
  });
  
  return (
    <div className="flex items-end justify-center gap-1.5 h-24">
      {bars.map((bar) => {
        // สร้าง gradient จากสีอ่อนไปเข้มตามตำแหน่ง
        const gradientStart = bar.id < 8 ? 'from-blue-300' : bar.id < 16 ? 'from-blue-400' : 'from-blue-500';
        const gradientEnd = bar.id < 8 ? 'to-blue-500' : bar.id < 16 ? 'to-blue-600' : 'to-blue-700';
        
        return (
          <div
            key={bar.id}
            className={`w-2 bg-gradient-to-t ${gradientStart} ${gradientEnd} rounded-full waveform-bar`}
            style={{
              height: `${Math.max(20, bar.height)}%`,
              animationDelay: `${bar.id * 0.04}s`,
            }}
          />
        );
      })}
    </div>
  );
};

// Loading Screen Component
const LoadingScreen = ({ 
  uploadProgress, 
  processingProgress 
}: { 
  uploadProgress?: { current: number; total: number } | null;
  processingProgress?: { current: number; total: number } | null;
}) => {
  const isUploading = uploadProgress && uploadProgress.total > 1;
  const isProcessing = processingProgress && processingProgress.total > 0;
  
  return (
    <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-2xl shadow-2xl p-16 mb-8 min-h-[500px] flex items-center justify-center">
      <div className="flex flex-col items-center justify-center text-center w-full">
        {/* รูปภาพ */}
        <div className="mb-8">
          <img 
            src="/test.JPEG" 
            alt="Processing" 
            className="max-w-full h-auto rounded-lg shadow-lg"
            style={{ maxHeight: '300px' }}
          />
        </div>
        
        {/* Waveform Loader */}
        <div className="mt-8">
          <WaveformLoader />
        </div>
        
        {/* Upload Progress Indicator */}
        {isUploading && (
          <div className="mt-6 w-full max-w-md">
            <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-gray-300 text-sm mt-2">
              Uploading chunks: {uploadProgress.current} / {uploadProgress.total}
            </p>
          </div>
        )}
        
        {/* Processing Progress Indicator */}
        {isProcessing && (
          <div className="mt-6 w-full max-w-md">
            <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-gray-300 text-sm mt-2">
              Processing segments: {processingProgress.current} / {processingProgress.total}
            </p>
          </div>
        )}
        
        {/* ข้อความ */}
        <h2 className="text-4xl font-bold text-white mt-12 mb-4">
          Your Transcription Is Being Processed
        </h2>
        <p className="text-gray-300 text-xl">
          {isUploading 
            ? `Uploading file... (${uploadProgress.current}/${uploadProgress.total} chunks)`
            : isProcessing
            ? `Processing audio segments... (${processingProgress.current}/${processingProgress.total})`
            : "We're converting your audio into high-quality text."}
        </p>
      </div>
    </div>
  );
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState<string>('You are an expert audio analyst. Please analyze this audio file and provide a SUMMARY (not a full transcript) in both Thai and English. English summary should be approximately 500 words and be the primary focus. Thai summary should be approximately 500 words for reference reading only. Format: Start with English summary, then Thai summary. Do NOT provide a word-by-word transcript - provide a concise summary of the key points and main content.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const maxSize = 90 * 1024 * 1024; // 90MB
      
      if (selectedFile.size > maxSize) {
        setError(`ไฟล์ใหญ่เกินไป! ขนาดสูงสุดที่รองรับ: 90MB (ไฟล์ของคุณ: ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  // ฟังก์ชันตัดไฟล์เสียงเป็น segments ตามเวลา (ใช้ Web Audio API)
  // ปรับขนาด segment ให้เหมาะสมกับ Vercel limit (~4MB) และ timeout (10s)
  const splitAudioIntoTimeSegments = async (audioFile: File, maxSegmentSizeMB: number = 3): Promise<File[]> => {
    const maxSegmentSizeBytes = maxSegmentSizeMB * 1024 * 1024;
    const segmentDurationSeconds = 10; // ลดเป็น 10 วินาทีเพื่อให้ประมวลผลเร็วขึ้น
    return new Promise(async (resolve, reject) => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const sampleRate = audioBuffer.sampleRate;
        const totalSamples = audioBuffer.length;
        const segmentSamples = segmentDurationSeconds * sampleRate;
        const totalSegments = Math.ceil(totalSamples / segmentSamples);
        
        const segments: File[] = [];
        
        // ฟังก์ชันช่วยสร้าง segment จากช่วง samples
        const createSegmentFromSamples = (startSample: number, endSample: number, segmentIndex: number): File => {
          const segmentLength = endSample - startSample;
          
          // สร้าง AudioBuffer สำหรับ segment นี้
          const segmentBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            segmentLength,
            sampleRate
          );
          
          // คัดลอกข้อมูลจาก audioBuffer ไปยัง segmentBuffer
          for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const segmentChannelData = segmentBuffer.getChannelData(channel);
            for (let j = 0; j < segmentLength; j++) {
              segmentChannelData[j] = channelData[startSample + j];
            }
          }
          
          // แปลง AudioBuffer เป็น WAV file
          const wav = audioBufferToWav(segmentBuffer);
          const blob = new Blob([wav], { type: 'audio/wav' });
          return new File([blob], `${audioFile.name}_segment_${segmentIndex}.wav`, { type: 'audio/wav' });
        };
        
        // แบ่ง segments และตรวจสอบขนาด
        let segmentIndex = 1;
        for (let i = 0; i < totalSegments; i++) {
          const startSample = i * segmentSamples;
          const endSample = Math.min(startSample + segmentSamples, totalSamples);
          
          let segmentFile = createSegmentFromSamples(startSample, endSample, segmentIndex);
          
          // ถ้า segment ใหญ่เกินไป ให้แบ่งย่อยลงอีก
          if (segmentFile.size > maxSegmentSizeBytes) {
            console.log(`Segment ${segmentIndex} is too large (${(segmentFile.size / 1024 / 1024).toFixed(2)}MB), splitting further...`);
            
            // แบ่งเป็น sub-segments ที่เล็กลง (5 วินาที)
            const subSegmentDuration = 5; // ลดเป็น 5 วินาทีเพื่อให้ประมวลผลเร็วขึ้น
            const subSegmentSamples = subSegmentDuration * sampleRate;
            const subStartSample = startSample;
            const subEndSample = endSample;
            const subTotalSegments = Math.ceil((subEndSample - subStartSample) / subSegmentSamples);
            
            for (let subI = 0; subI < subTotalSegments; subI++) {
              const subStart = subStartSample + (subI * subSegmentSamples);
              const subEnd = Math.min(subStart + subSegmentSamples, subEndSample);
              
              const subSegmentFile = createSegmentFromSamples(subStart, subEnd, segmentIndex);
              
              // ถ้ายังใหญ่เกินไป ให้แบ่งเป็น 3 วินาที
              if (subSegmentFile.size > maxSegmentSizeBytes) {
                console.log(`Sub-segment ${segmentIndex} is still too large, splitting to 3s segments...`);
                const tinySegmentDuration = 3;
                const tinySegmentSamples = tinySegmentDuration * sampleRate;
                const tinyTotalSegments = Math.ceil((subEnd - subStart) / tinySegmentSamples);
                
                for (let tinyI = 0; tinyI < tinyTotalSegments; tinyI++) {
                  const tinyStart = subStart + (tinyI * tinySegmentSamples);
                  const tinyEnd = Math.min(tinyStart + tinySegmentSamples, subEnd);
                  const tinySegmentFile = createSegmentFromSamples(tinyStart, tinyEnd, segmentIndex);
                  segments.push(tinySegmentFile);
                  segmentIndex++;
                }
              } else {
                segments.push(subSegmentFile);
                segmentIndex++;
              }
            }
          } else {
            segments.push(segmentFile);
            segmentIndex++;
          }
        }
        
        console.log(`Created ${segments.length} segments from audio file`);
        resolve(segments);
      } catch (error) {
        console.error('Error splitting audio:', error);
        reject(error);
      }
    });
  };

  // ฟังก์ชันแปลง AudioBuffer เป็น WAV format
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    // WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // RIFF identifier
    setUint32(0x46464952); // "RIFF"
    setUint32(36 + length * numberOfChannels * 2); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // format chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // chunk size
    setUint16(1); // audio format (1 = PCM)
    setUint16(numberOfChannels);
    setUint32(sampleRate);
    setUint32(sampleRate * numberOfChannels * 2); // byte rate
    setUint16(numberOfChannels * 2); // block align
    setUint16(16); // bits per sample

    // data chunk
    setUint32(0x61746164); // "data"
    setUint32(length * numberOfChannels * 2);

    // write interleaved data
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < arrayBuffer.byteLength) {
      for (let i = 0; i < numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return arrayBuffer;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('กรุณาเลือกไฟล์เสียง');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setUploadProgress(null);
    setProcessingProgress(null);

    // ตรวจสอบขนาดไฟล์อีกครั้งก่อนส่ง
    const maxSize = 90 * 1024 * 1024; // 90MB
    if (file.size > maxSize) {
      setError(`ไฟล์ใหญ่เกินไป! ขนาดสูงสุดที่รองรับ: 90MB (ไฟล์ของคุณ: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      setLoading(false);
      return;
    }

    try {
      // วิธีใหม่: ส่งไฟล์ทั้งหมดไปยัง Gemini โดยตรงจาก client (ไม่ต้องตัดแบ่ง)
      // ข้อดี: ไม่มี timeout limit, ได้ผลลัพธ์ครบถ้วน, เร็วกว่า
      // ลองส่งไฟล์ทั้งหมดก่อน ถ้า error ก็ fallback ไปใช้วิธีแบ่ง segments
      
      // ลองส่งไฟล์ทั้งหมดไปยัง Gemini โดยตรง (ไม่จำกัดขนาด)
      // ถ้า Gemini API reject หรือ error ก็จะ fallback ไปใช้วิธีแบ่ง segments
      {
        // ส่งไฟล์ทั้งหมดไปยัง Gemini โดยตรง
        console.log('Processing entire file directly from client...');
        setUploadProgress({ current: 1, total: 1 });
        setProcessingProgress({ current: 0, total: 1 });
        
        try {
          // ดึง API key จาก server
          const apiKeyResponse = await fetch('/api/get-api-key');
          if (!apiKeyResponse.ok) {
            throw new Error('ไม่สามารถดึง API key ได้');
          }
          const apiKeyData = await apiKeyResponse.json();
          if (!apiKeyData.apiKey) {
            throw new Error('ไม่พบ API key');
          }
          
          const genAI = new GoogleGenerativeAI(apiKeyData.apiKey);
          const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro',
          ];
          
          // อ่านไฟล์เป็น base64
          setProcessingProgress({ current: 0.5, total: 1 });
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // แปลงเป็น base64 แบบ chunk เพื่อหลีกเลี่ยงปัญหา memory
          let binaryString = '';
          const chunkSize = 8192; // 8KB chunks
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          const base64Audio = btoa(binaryString);
          
          setProcessingProgress({ current: 0.7, total: 1 });
          
          // ประมวลผลด้วย Gemini API
          let text = '';
          let lastError: any = null;
          let successfulModel = '';
          
          for (const modelName of modelsToTry) {
            try {
              console.log(`Trying model: ${modelName}`);
              const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: {
                  maxOutputTokens: 8192, // เพิ่ม output token limit สูงสุด
                }
              });
              
              // ใช้ Streaming API เพื่อรับผลลัพธ์ทั้งหมดในครั้งเดียว
              // สร้าง prompt ที่ชัดเจนและเน้นย้ำให้ AI ทำตามคำสั่ง
              const enhancedPrompt = `${prompt}\n\nIMPORTANT INSTRUCTIONS:\n- You MUST follow the prompt instructions exactly\n- If the prompt asks for a summary, provide a summary, NOT just a transcript\n- If the prompt asks for both Thai and English summaries, provide both\n- Do NOT just transcribe the audio word-by-word unless specifically asked\n- Follow the format and requirements specified in the prompt above`;
              
              const result = await model.generateContentStream([
                {
                  inlineData: {
                    data: base64Audio,
                    mimeType: file.type || 'audio/mp4',
                  },
                },
                enhancedPrompt,
              ]);
              
              // รวบรวมผลลัพธ์ทั้งหมดจาก stream
              let fullText = '';
              for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) {
                  fullText += chunkText;
                  // อัปเดต progress แบบ real-time
                  setProcessingProgress({ current: 0.8 + Math.min((fullText.length / 200000) * 0.2, 0.2), total: 1 });
                }
              }
              
              if (fullText && fullText.trim().length > 0) {
                text = fullText;
                successfulModel = modelName;
                console.log(`✅ Success with model: ${modelName}, text length: ${text.length}`);
                break;
              }
            } catch (err: any) {
              lastError = err;
              console.log(`❌ Model ${modelName} failed: ${err.message?.substring(0, 100)}`);
              continue;
            }
          }
          
          if (!text) {
            throw new Error(lastError?.message || 'ไม่สามารถประมวลผลเสียงได้');
          }
          
          setProcessingProgress({ current: 1, total: 1 });
          
          setResult({
            success: true,
            message: `ประมวลผลเสร็จสิ้น (ใช้ model: ${successfulModel})`,
            result: text,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'audio/mp4',
          });
          
          setProcessingProgress(null);
          setUploadProgress(null);
          setLoading(false);
          return;
        } catch (error: any) {
          console.error('Error processing file directly:', error);
          // ถ้าล้มเหลว (อาจเป็นเพราะไฟล์ใหญ่เกิน Gemini limit) ให้ fallback ไปใช้วิธีแบ่ง segments
          console.log('File too large or API error, falling back to segment-based processing...');
          
          // ตรวจสอบว่า error เป็นเพราะไฟล์ใหญ่เกินหรือไม่
          const isFileTooLarge = error.message?.includes('too large') || 
                                 error.message?.includes('size') ||
                                 error.message?.includes('limit') ||
                                 error.status === 413;
          
          if (isFileTooLarge) {
            console.log('File is too large for direct processing, using segmentation...');
          } else {
            // ถ้าไม่ใช่ปัญหาไฟล์ใหญ่ อาจเป็นปัญหาอื่น ให้ลองอีกครั้งหรือใช้ segmentation
            console.log('Unknown error, trying segmentation method...');
          }
        }
      }
      
      // วิธี fallback: แบ่งเป็น segments สำหรับไฟล์ที่ส่งทั้งหมดไม่ได้
      // (โค้ดด้านล่างจะทำงานถ้าส่งไฟล์ทั้งหมดล้มเหลว)
      // แบ่งไฟล์เป็น segments ตามเวลา
      console.log('Splitting audio into time segments...');
      setUploadProgress({ current: 0, total: 1 }); // แสดงว่าเริ่มตัดไฟล์
      
      let segments: File[];
      try {
        segments = await splitAudioIntoTimeSegments(file, 3); // สูงสุด 3MB ต่อ segment
      } catch (splitError: any) {
        console.error('Error splitting audio:', splitError);
        // ถ้าไม่สามารถตัดได้ ให้ใช้วิธีเดิม (chunk upload)
        console.log('Falling back to chunk upload method...');
        segments = [];
      }
      
      if (segments.length > 0) {
          // ประมวลผลแบบ parallel (ส่งหลาย segments พร้อมกัน) เพื่อลดเวลา
          const totalSegments = segments.length;
          const results: (string | null)[] = new Array(totalSegments).fill(null);
          const maxConcurrent = 3; // ส่งพร้อมกันสูงสุด 3 segments
          
          setProcessingProgress({ current: 0, total: totalSegments });
          
          // ดึง API key จาก server (ครั้งเดียว)
          const apiKeyResponse = await fetch('/api/get-api-key');
          if (!apiKeyResponse.ok) {
            throw new Error('ไม่สามารถดึง API key ได้');
          }
          const apiKeyData = await apiKeyResponse.json();
          if (!apiKeyData.apiKey) {
            throw new Error('ไม่พบ API key');
          }
          
          const genAI = new GoogleGenerativeAI(apiKeyData.apiKey);
          const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro',
          ];
          
          // ฟังก์ชันประมวลผล segment เดียว (จาก client โดยตรง)
          const processSegment = async (index: number): Promise<void> => {
            try {
              // ตรวจสอบขนาด segment
              const segmentSizeMB = segments[index].size / 1024 / 1024;
              if (segmentSizeMB > 3.5) {
                console.warn(`Segment ${index + 1} is ${segmentSizeMB.toFixed(2)}MB, may cause issues`);
              }
              
              // อ่านไฟล์เป็น base64 (วิธีที่รองรับไฟล์ใหญ่)
              const arrayBuffer = await segments[index].arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              
              // แปลงเป็น base64 แบบ chunk เพื่อหลีกเลี่ยงปัญหา memory
              let binaryString = '';
              const chunkSize = 8192; // 8KB chunks
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                binaryString += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const base64Audio = btoa(binaryString);
              
              // สร้าง prompt สำหรับ segment นี้ (เพิ่มคำสั่งให้ชัดเจน)
              const segmentPrompt = totalSegments > 1 
                ? `${prompt}\n\nIMPORTANT: This is segment ${index + 1} of ${totalSegments} parts of the audio file. Process this segment according to the prompt instructions above.\n\nIMPORTANT INSTRUCTIONS:\n- You MUST follow the prompt instructions exactly\n- If the prompt asks for a summary, provide a summary, NOT just a transcript\n- If the prompt asks for both Thai and English summaries, provide both\n- Do NOT just transcribe the audio word-by-word unless specifically asked`
                : `${prompt}\n\nIMPORTANT INSTRUCTIONS:\n- You MUST follow the prompt instructions exactly\n- If the prompt asks for a summary, provide a summary, NOT just a transcript\n- If the prompt asks for both Thai and English summaries, provide both\n- Do NOT just transcribe the audio word-by-word unless specifically asked`;
              
              let text = '';
              let lastError: any = null;
              
              // ลองใช้ model ต่างๆ (ใช้ streaming เพื่อรับผลลัพธ์ทั้งหมด)
              for (const modelName of modelsToTry) {
                try {
                  const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    generationConfig: {
                      maxOutputTokens: 8192, // เพิ่ม output token limit สูงสุด
                    }
                  });
                  
                  // ใช้ Streaming API เพื่อรับผลลัพธ์ทั้งหมด
                  // เน้นย้ำให้ AI ทำตามคำสั่งใน prompt
                  const enhancedSegmentPrompt = `${segmentPrompt}\n\nRemember: Follow the original prompt instructions carefully. Do not just transcribe - provide the requested format (summary, analysis, etc.)`;
                  
                  const result = await model.generateContentStream([
                    {
                      inlineData: {
                        data: base64Audio,
                        mimeType: segments[index].type || 'audio/wav',
                      },
                    },
                    enhancedSegmentPrompt,
                  ]);
                  
                  // รวบรวมผลลัพธ์ทั้งหมดจาก stream
                  let fullText = '';
                  for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    if (chunkText) {
                      fullText += chunkText;
                    }
                  }
                  
                  if (fullText && fullText.trim().length > 0) {
                    text = fullText;
                    break;
                  }
                } catch (err: any) {
                  lastError = err;
                  continue;
                }
              }
              
              if (!text) {
                throw new Error(lastError?.message || 'ไม่สามารถประมวลผลเสียงได้');
              }
              
              results[index] = text;
              setProcessingProgress({ current: results.filter(r => r !== null).length, total: totalSegments });
            } catch (error: any) {
              console.error(`Error processing segment ${index + 1}:`, error);
              // เก็บ error ไว้ใน results แทน null
              results[index] = `[ERROR: Segment ${index + 1} failed: ${error.message}]`;
              setProcessingProgress({ current: results.filter(r => r !== null).length, total: totalSegments });
            }
          };
          
          // ประมวลผลแบบ batch (ส่งพร้อมกันสูงสุด maxConcurrent)
          for (let i = 0; i < segments.length; i += maxConcurrent) {
            const batch = segments.slice(i, i + maxConcurrent);
            const batchPromises = batch.map((_, batchIndex) => processSegment(i + batchIndex));
            
            // รอให้ batch นี้เสร็จก่อนไป batch ถัดไป
            await Promise.all(batchPromises);
          }
          
          // กรอง null results (ถ้ามี)
          const validResults = results.filter(r => r !== null && !r.startsWith('[ERROR:')) as string[];
          const errorResults = results.filter(r => r !== null && r.startsWith('[ERROR:'));
          
          if (errorResults.length > 0) {
            console.warn(`Some segments failed:`, errorResults);
          }
          
          if (validResults.length === 0) {
            throw new Error('All segments failed to process');
          }
          
          // รวมผลลัพธ์
          let combinedResult = validResults.join('\n\n--- Segment Break ---\n\n');
          
          if (errorResults.length > 0) {
            // เพิ่ม warning message ในผลลัพธ์
            combinedResult = `⚠️ หมายเหตุ: ${errorResults.length} จาก ${totalSegments} segments ประมวลผลไม่สำเร็จ\n\n${combinedResult}`;
          }
          
          setResult({
            success: true,
            message: `ประมวลผลเสร็จสิ้น (${validResults.length}/${totalSegments} segments สำเร็จ)`,
            result: combinedResult,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type || 'audio/mp4',
          });
          
        setProcessingProgress(null);
        setUploadProgress(null);
        setLoading(false);
        return;
      }
      
      // ใช้ chunk upload สำหรับไฟล์ใหญ่กว่า 3MB (Vercel Free tier limit ~4.5MB แต่ใช้ 3MB เพื่อความปลอดภัย)
      const chunkSize = 3 * 1024 * 1024; // 3MB per chunk (ปลอดภัยกว่า 4MB)
      const useChunkUpload = file.size > chunkSize;

      if (useChunkUpload) {
        // Chunk Upload - ส่ง chunks ไปยัง server แล้วรวมที่ server
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const totalChunks = Math.ceil(file.size / chunkSize);

        // ส่ง chunks ทีละ chunk
        for (let i = 0; i < totalChunks; i++) {
          setUploadProgress({ current: i + 1, total: totalChunks });
          
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);

          const chunkFormData = new FormData();
          chunkFormData.append('chunk', chunk);
          chunkFormData.append('chunkIndex', i.toString());
          chunkFormData.append('totalChunks', totalChunks.toString());
          chunkFormData.append('sessionId', sessionId);
          chunkFormData.append('fileName', file.name);
          chunkFormData.append('mimeType', file.type || 'audio/mp4');
          
          // ส่ง prompt ไปด้วยในทุก chunk เพื่อให้แน่ใจว่ามี prompt เมื่อ chunks ครบ
          chunkFormData.append('prompt', prompt);
          
          // บอกว่า chunk นี้เป็น chunk สุดท้ายหรือไม่
          if (i === totalChunks - 1) {
            chunkFormData.append('processImmediately', 'true');
          }

          const chunkResponse = await fetch('/api/upload-chunk', {
            method: 'POST',
            body: chunkFormData,
          });

          // ตรวจสอบ content-type ก่อน parse JSON
          const contentType = chunkResponse.headers.get('content-type');
          let chunkData;
          
          if (contentType && contentType.includes('application/json')) {
            chunkData = await chunkResponse.json();
          } else {
            const text = await chunkResponse.text();
            throw new Error(`Failed to upload chunk: ${text.substring(0, 200)}`);
          }

          if (!chunkResponse.ok) {
            throw new Error(chunkData.error || chunkData.details || 'Failed to upload chunk');
          }
          
          // ถ้า chunks ครบและประมวลผลเสร็จแล้ว
          if (chunkData.complete) {
            console.log('Chunks complete, checking for result...', chunkData);
            if (chunkData.result) {
              // ได้ผลลัพธ์แล้ว (ประมวลผลเสร็จ)
              console.log('Got result, setting state...');
              setResult({
                success: true,
                message: chunkData.message || 'ประมวลผลเสร็จสิ้น',
                result: chunkData.result,
                fileName: chunkData.fileName,
                fileSize: chunkData.fileSize,
                fileType: chunkData.fileType,
              });
              setUploadProgress(null);
              break;
            } else {
              // chunks ครบแล้วแต่ยังไม่ประมวลผล
              console.warn('Chunks complete but no result. Data:', chunkData);
              // ถ้า processImmediately = true แต่ไม่มี result อาจเป็นเพราะ timeout หรือ error
              if (i === totalChunks - 1) {
                setUploadProgress(null);
                throw new Error('Chunks uploaded but processing failed or timed out. Please try again.');
              }
            }
          } else {
            console.log(`Chunk ${i + 1}/${totalChunks} uploaded. Progress: ${chunkData.received || 0}/${chunkData.total || totalChunks}`);
          }
        }
      } else {
        // ไฟล์เล็ก ใช้วิธีเดิม
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('prompt', prompt);

        const response = await fetch('/api/remove-voice', {
          method: 'POST',
          body: formData,
        });

        // ตรวจสอบ content-type ก่อน parse JSON
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          
          if (response.status === 413) {
            throw new Error('ไฟล์ใหญ่เกินไป! Server ไม่สามารถประมวลผลไฟล์ขนาดนี้ได้ กรุณาลดขนาดไฟล์หรือแบ่งเป็นไฟล์เล็กๆ');
          } else if (response.status >= 500) {
            throw new Error('Server error: ' + text.substring(0, 200));
          } else {
            throw new Error('เกิดข้อผิดพลาด: ' + text.substring(0, 200));
          }
        }

        if (!response.ok) {
          throw new Error(data.error || data.details || 'เกิดข้อผิดพลาด');
        }

        setResult(data);
      }
    } catch (err: any) {
      // แสดง error message ที่ชัดเจน
      if (err.message) {
        setError(err.message);
      } else if (err instanceof TypeError && err.message.includes('JSON')) {
        setError('Server ตอบกลับด้วยข้อมูลที่ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      } else {
        setError('เกิดข้อผิดพลาดในการประมวลผล: ' + (err.toString() || 'Unknown error'));
      }
      console.error('Error:', err);
    } finally {
      setLoading(false);
      setUploadProgress(null);
      setProcessingProgress(null);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setPrompt('You are an expert audio analyst. Please analyze this audio file and provide a SUMMARY (not a full transcript) in both Thai and English. English summary should be approximately 500 words and be the primary focus. Thai summary should be approximately 500 words for reference reading only. Format: Start with English summary, then Thai summary. Do NOT provide a word-by-word transcript - provide a concise summary of the key points and main content.');
  };

  const handleCopyText = async () => {
    if (result?.result) {
      try {
        // คัดลอกข้อความต้นฉบับ (ไม่ใช่ formatted version)
        await navigator.clipboard.writeText(result.result);
        // แสดง notification (สามารถใช้ toast library ได้)
        alert('คัดลอกข้อความสำเร็จ!');
      } catch (err) {
        console.error('Failed to copy:', err);
        alert('ไม่สามารถคัดลอกข้อความได้');
      }
    }
  };

  // จัดเรียง text ให้อ่านง่ายขึ้น (แบบปลอดภัย - ไม่ทำให้ข้อความหาย)
  const formatText = (text: string) => {
    if (!text) return '';
    
    try {
      // แบ่งประโยคแบบระมัดระวัง - เก็บข้อความทั้งหมดไว้
      let formatted = text
        // แบ่งประโยคตามเครื่องหมายวรรคตอน + ตัวพิมพ์ใหญ่ (ภาษาอังกฤษ)
        .replace(/([.!?])\s+([A-Z][a-z])/g, '$1\n\n$2')
        // แบ่งประโยคตามเครื่องหมายวรรคตอน + ตัวอักษรไทย
        .replace(/([.!?])\s+([ก-๙])/g, '$1\n\n$2')
        // แบ่งประโยคตามเครื่องหมายวรรคตอน + ตัวเลข (อาจเป็นประโยคใหม่)
        .replace(/([.!?])\s+(\d)/g, '$1\n\n$2')
        // ลบบรรทัดว่างที่มากเกินไป (มากกว่า 3 บรรทัด)
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
      
      // ตรวจสอบว่าข้อความไม่หาย - ถ้าสั้นกว่า 90% ของต้นฉบับ ให้ใช้ต้นฉบับ
      if (formatted.length < text.length * 0.9) {
        console.warn('Formatted text may have lost content, using original');
        // ใช้ต้นฉบับแต่เพิ่ม line breaks แบบง่ายๆ
        return text.replace(/\n{3,}/g, '\n\n');
      }
      
      return formatted;
    } catch (error) {
      console.error('Error formatting text:', error);
      // ถ้ามี error ให้คืนค่า text เดิม
      return text;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
              🎵 ถอนเสียงด้วย สมองจิโรจ
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              อัปโหลดไฟล์เสียงเพื่อประมวลผลด้วย สุดหล่อ
            </p>
          </div>

          {/* Upload Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Prompt Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prompt (คำสั่งสำหรับ AI)
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed resize-y"
                  placeholder="พิมพ์ prompt ที่ต้องการให้ AI ประมวลผล..."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  คุณสามารถแก้ไข prompt นี้ได้ตามต้องการ
                </p>
              </div>

              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เลือกไฟล์เสียง
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg hover:border-indigo-500 transition-colors">
                  <div className="space-y-1 text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex text-sm text-gray-600 dark:text-gray-400">
                      <label className="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                        <span>อัปโหลดไฟล์</span>
                        <input
                          type="file"
                          className="sr-only"
                          accept="audio/*"
                          onChange={handleFileChange}
                          disabled={loading}
                        />
                      </label>
                      <p className="pl-1">หรือลากวางไฟล์ที่นี่</p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      MP3, WAV, OGG, WebM, M4A (สูงสุด 90MB)
                    </p>
                  </div>
                </div>
                {file && (
                  <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">ไฟล์ที่เลือก:</span> {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ขนาด: {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={!file || loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      กำลังประมวลผล...
                    </span>
                  ) : (
                    'ประมวลผลเสียง'
                  )}
                </button>
                {file && (
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={loading}
                    className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    รีเซ็ต
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Loading Screen */}
          {loading && <LoadingScreen uploadProgress={uploadProgress} processingProgress={processingProgress} />}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                ผลลัพธ์การประมวลผล
              </h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ข้อมูลไฟล์
                  </h3>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p><span className="font-medium">ชื่อไฟล์:</span> {result.fileName}</p>
                    <p><span className="font-medium">ขนาด:</span> {(result.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                    <p><span className="font-medium">ประเภท:</span> {result.fileType}</p>
                  </div>
                </div>

                <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-indigo-900 dark:text-indigo-300">
                      ผลการวิเคราะห์จาก สุดหล่อจิโรจ
                    </h3>
                    <button
                      onClick={handleCopyText}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                      title="คัดลอกข้อความทั้งหมด"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      คัดลอก
                    </button>
                  </div>
                  <div className="text-base text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed font-sans max-h-[600px] overflow-y-auto pr-2">
                    {formatText(result.result)}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    ความยาว: {result.result?.length || 0} ตัวอักษร
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
