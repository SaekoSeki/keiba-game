// ============================================================
// スライド用のQRコード画像(qr.png)を作るスクリプト
// ------------------------------------------------------------
// 使い方(デプロイ後の公開URLを渡す):
//   node qr作成.js https://あなたのアプリ.onrender.com
//   または  npm run qr -- https://あなたのアプリ.onrender.com
//
// → このフォルダの qr.png を上書き生成します。
//    slides.md はこの qr.png を参照しているので、スライドのQRが差し替わります。
// ============================================================

const QRCode = require('qrcode');

// コマンドラインで渡されたURLを受け取る
const url = process.argv[2];

if (!url) {
  console.log('使い方: node qr作成.js <公開URL>');
  console.log('例:     node qr作成.js https://keiba-game.onrender.com');
  process.exit(1);
}

// 印刷・スライドでも綺麗に見えるよう、大きめ(600px)で作る
QRCode.toFile('qr.png', url, { width: 600, margin: 2 }, (err) => {
  if (err) {
    console.error('QR生成に失敗しました:', err);
    process.exit(1);
  }
  console.log('qr.png を生成しました。');
  console.log('  指す先: ' + url);
  console.log('  スライド(slides.md)のQRがこのURLに差し替わります。');
});
