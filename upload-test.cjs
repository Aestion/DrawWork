const http = require('http');
const fs = require('fs');

const filePath = 'C:\\Users\\54656\\Downloads\\你别管，让我一直吃.mp4';
const fileBuffer = fs.readFileSync(filePath);
const filename = '你别管，让我一直吃.mp4';
const boundary = '----TestBoundary' + Date.now();

const loginData = JSON.stringify({email:'usera@test.com',password:'UserAPass'});
const loginReq = http.request({
  hostname:'localhost', port:3000, path:'/api/auth/login', method:'POST',
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginData)}
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (!data.token) { console.log('Login failed:'); return; }
      doUpload(data.token);
    } catch(e) { console.log('Parse error:', e.message); }
  });
});
loginReq.write(loginData);
loginReq.end();

function doUpload(token) {
  const CRLF = '\r\n';
  let headerStr = '';
  headerStr += '--' + boundary + CRLF;
  headerStr += 'Content-Disposition: form-data; name="file"; filename="' + filename + '"' + CRLF;
  headerStr += 'Content-Type: video/mp4' + CRLF + CRLF;
  const header = Buffer.from(headerStr, 'utf-8');
  const footer = Buffer.from(CRLF + '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="board_id"' + CRLF + CRLF +
    'eadee115-05b7-43e4-a086-7ca856033dbe' + CRLF +
    '--' + boundary + '--' + CRLF, 'utf-8');
  const fullBody = Buffer.concat([header, fileBuffer, footer]);

  console.log('Uploading MP4:', fileBuffer.length, 'bytes');

  const uploadReq = http.request({
    hostname:'localhost', port:3000, path:'/api/upload', method:'POST',
    headers:{
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': fullBody.length,
      'Authorization': 'Bearer ' + token
    }
  }, (res2) => {
    let b2 = '';
    res2.on('data', c => b2 += c);
    res2.on('end', () => {
      console.log('Upload status:', res2.statusCode);
      console.log('Response:', b2.slice(0,300));
    });
  });
  uploadReq.write(fullBody);
  uploadReq.end();
}
