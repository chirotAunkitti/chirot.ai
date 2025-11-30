'use client';

import { useState } from 'react';

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
const LoadingScreen = () => {
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
        
        {/* ข้อความ */}
        <h2 className="text-4xl font-bold text-white mt-12 mb-4">
          Your Transcription Is Being Processed
        </h2>
        <p className="text-gray-300 text-xl">
          We're converting your audio into high-quality text.
        </p>
      </div>
    </div>
  );
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState<string>('คุณเป็นผู้เชี่ยวชาญในการประมวลผลเสียง กรุณาวิเคราะห์ไฟล์เสียงนี้ ออกมา ถอดเสียง เป็น Text จาก คลิป เสียนี้ สรุป เป็นไทย อังกฤษ ย่างละ 500 คำ อังกฤษ เป็นหลัก ภาษาไทยเอามา อ่านเฉยๆ');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError('กรุณาเลือกไฟล์เสียง');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // ตรวจสอบขนาดไฟล์อีกครั้งก่อนส่ง
    const maxSize = 90 * 1024 * 1024; // 90MB
    if (file.size > maxSize) {
      setError(`ไฟล์ใหญ่เกินไป! ขนาดสูงสุดที่รองรับ: 90MB (ไฟล์ของคุณ: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      setLoading(false);
      return;
    }

    try {
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
        // ถ้าไม่ใช่ JSON (เช่น 413 error ที่อาจเป็น HTML)
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
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setPrompt('คุณเป็นผู้เชี่ยวชาญในการประมวลผลเสียง กรุณาวิเคราะห์ไฟล์เสียงนี้ออกมา ถอดเสียง เป็น Text จาก คลิป เสียนี้ สรุป เป็นไทย อังกฤษ ย่างละ 500 คำ อังกฤษ เป็นหลัก ภาษาไทยเอามา อ่านเฉยๆ');
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
          {loading && <LoadingScreen />}

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
