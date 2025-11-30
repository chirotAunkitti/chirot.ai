#!/bin/bash
# Test API endpoint
curl 'https://chirot-jn002yixu-chirot230346-gmailcoms-projects.vercel.app/api/remove-voice' \
  -H 'accept: */*' \
  -H 'content-type: multipart/form-data; boundary=----WebKitFormBoundaryRPBUIJx208QzlT3z' \
  --data-raw $'------WebKitFormBoundaryRPBUIJx208QzlT3z\r\nContent-Disposition: form-data; name="audio"; filename="test.m4a"\r\nContent-Type: audio/x-m4a\r\n\r\n\r\n------WebKitFormBoundaryRPBUIJx208QzlT3z\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nคุณเป็นผู้เชี่ยวชาญในการประมวลผลเสียง กรุณาวิเคราะห์ไฟล์เสียงนี้ ออกมา ถอดเสียง เป็น Text จาก คลิป เสียนี้ สรุป เป็นไทย อังกฤษ ย่างละ 500 คำ อังกฤษ เป็นหลัก ภาษาไทยเอามา อ่านเฉยๆ\r\n------WebKitFormBoundaryRPBUIJx208QzlT3z--\r\n'
