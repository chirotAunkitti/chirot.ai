# 🚀 วิธี Deploy โปรเจกต์นี้

## วิธีที่ 1: ใช้ Vercel (แนะนำ) ⭐

Vercel รองรับ Next.js โดยตรงและฟรี!

### ขั้นตอน:

1. ไปที่ [vercel.com](https://vercel.com) และ Sign up ด้วย GitHub account
2. คลิก "New Project"
3. เลือก repository `chirotAunkitti/voice-removal`
4. เพิ่ม Environment Variable:
   - `GEMINI_API_KEY` = API key ของคุณ
5. คลิก "Deploy"
6. รอสักครู่ Vercel จะ deploy ให้อัตโนมัติ!

### ข้อดี:
- ✅ ฟรี
- ✅ รองรับ Next.js API routes
- ✅ Auto-deploy เมื่อ push code
- ✅ HTTPS อัตโนมัติ
- ✅ Custom domain ได้

---

## วิธีที่ 2: ใช้ GitHub Pages (ต้องแก้ไขโค้ด)

GitHub Pages รองรับแค่ static files เท่านั้น ดังนั้นต้อง:

1. แปลง API routes เป็น external API หรือ
2. ใช้ GitHub Actions + Vercel

---

## วิธีที่ 3: ใช้ Netlify

1. ไปที่ [netlify.com](https://netlify.com)
2. Sign up ด้วย GitHub
3. เลือก repository
4. เพิ่ม Environment Variables
5. Deploy!

---

## 🔗 Links

- Vercel: https://vercel.com
- GitHub Pages: https://pages.github.com
- Netlify: https://netlify.com

