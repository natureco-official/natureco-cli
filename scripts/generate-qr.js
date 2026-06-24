const QRCode = require('qrcode');
const fs = require('fs');

// Standart QR data for WhatsApp web login (test QR)
// Gercek QR data Baileys'ten gelecek

const qrData = process.argv[2] || 'WhatsApp QR test data';
const outPath = process.argv[3] || '/Users/gencay/Downloads/whatsapp-qr.png';

QRCode.toFile(outPath, qrData, {
  type: 'png',
  width: 600,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}, (err) => {
  if (err) console.error('Hata:', err);
  else console.log('✓ QR PNG:', outPath);
});
