// ============================================================
// 競馬ゲーム サーバ (app.js)
// ------------------------------------------------------------
// やっていること(ざっくり):
//   1) ゲーム本体(index.html など)をブラウザに配信する
//   2) 「参加・結果・ランキング」のための API を用意する
//
// 参加の流れ:
//   QRを読む → ゲームを開く → 名前を登録(/api/join)
//   → 各自レースして遊ぶ → 所持金をサーバに送る(/api/result)
//   → 全員の所持金を多い順に並べたランキングを取得(/api/ranking)
//
// ※ データは「メモリ(この配列)」に置くだけのシンプル版です。
//    サーバを再起動すると参加者データは消えます(LTデモ用の割り切り)。
//    本格的に残したい場合は Mongoose などのDBに置き換えてください。
// ============================================================

// ----- 必要な部品を読み込む -----
const express = require('express');   // Webサーバを簡単に作るための道具
const path = require('path');         // ファイルの場所(パス)を扱う道具
const QRCode = require('qrcode');     // QRコード画像を作る道具

// Express の本体(アプリ)を作る
const app = express();

// ngrok / Cloudflare Tunnel などのトンネル(プロキシ)越しでも、
// 「本当に使われているURL(https)」を正しく判定できるようにする設定。
// これで /qr が作るQRコードがトンネルの公開URLを指すようになる。
app.set('trust proxy', true);

// 受け付けるポート番号。
// クラウド(Render等)では、ホスト側が使うポートを環境変数 PORT で渡してくる。
// それが無いローカルでは 3000 を使う(= http://localhost:3000)。
const PORT = process.env.PORT || 3000;

// ============================================================
// ===== ミドルウェア(全リクエスト共通の前処理) =====
// ============================================================

// このフォルダの中のファイル(index.html や qr.png など)を
// そのまま配信する。これで http://localhost:3000/ で index.html が開く。
app.use(express.static(__dirname));

// クライアントから送られてくる JSON の本文(body)を読めるようにする。
// これが無いと req.body が空になる。
app.use(express.json());

// ============================================================
// ===== 参加者データ(メモリ上に保存) =====
//   participants の中身(1人分):
//     { id: 'p1', name: 'たろう', balance: 1200, net: 200, updatedAt: 169.. }
//       id        … 参加者を見分けるための番号(サーバが採番)
//       name      … 表示名
//       balance   … 現在の所持金(円)
//       net       … 開始時(1000円)からの収支(増えた/減った額)
//       updatedAt … 最後に結果を送ってきた時刻(同点時の並び順に使う)
// ============================================================
let participants = [];

// ID採番用のカウンタ。join のたびに 1 ずつ増やして 'p1','p2'... を作る。
let nextId = 1;

// ============================================================
// ===== ランキングを計算する関数(純粋な計算だけ) =====
//   入力: 参加者の配列
//   出力: [{ rank, id, name, balance, net }, ...] (1位から順)
//
//   並び順: 所持金(balance)が多い順。
//   同じ所持金なら「先に更新した人」を上にする(updatedAt が小さい順)。
//
//   順位の付け方は「競技順位(standard competition ranking)」:
//     所持金が同じ人は同じ順位にし、その次の順位は人数分とばす。
//     例) 1500, 1200, 1200, 900 → 1位, 2位, 2位, 4位
// ============================================================
function computeRanking(list) {
  // 元の配列を壊さないようにコピーしてから並べ替える
  const sorted = [...list].sort((a, b) => {
    // (1) まず所持金の多い順(降順)
    if (b.balance !== a.balance) {
      return b.balance - a.balance;
    }
    // (2) 所持金が同じなら、早く結果を出した人を上に(昇順)
    return a.updatedAt - b.updatedAt;
  });

  // 並べ替えた順に順位を付けていく
  const ranked = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];

    // 直前の人と「所持金が同じ」なら、順位も同じにする。
    // そうでなければ、順位は「今の位置+1」(同点でとばした分が反映される)。
    let rank;
    if (i > 0 && sorted[i - 1].balance === p.balance) {
      rank = ranked[i - 1].rank;          // 1つ上の人と同順位
    } else {
      rank = i + 1;                       // 通常はこの位置の順位
    }

    ranked.push({
      rank: rank,
      id: p.id,
      name: p.name,
      balance: p.balance,
      net: p.net
    });
  }
  return ranked;
}

// ============================================================
// ===== API: 参加登録 =====
//   POST /api/join   body: { name: '名前' }
//   → 参加者を1人作って { id, name } を返す
// ============================================================
app.post('/api/join', (req, res) => {
  // 送られてきた名前を取り出す。空なら「ななしさん」にする。
  let name = (req.body && req.body.name ? String(req.body.name) : '').trim();
  if (!name) {
    name = 'ななしさん';
  }
  // 長すぎる名前は20文字に切る(表示崩れ防止)
  name = name.slice(0, 20);

  // 新しい参加者を作る
  const participant = {
    id: 'p' + nextId,     // 例: 'p1'
    name: name,
    balance: 1000,        // ゲーム開始時の所持金(クライアント側と合わせる)
    net: 0,               // まだ遊んでいないので収支0
    updatedAt: nextId     // 仮の更新順(まだ結果が無いので採番順を使う)
  };
  nextId++;               // 次の人のためにカウンタを進める

  participants.push(participant);
  console.log(`参加登録: ${participant.id} / ${participant.name} (現在 ${participants.length} 人)`);

  // クライアントには id と name を返す(idはこの先ずっと使う)
  res.json({ id: participant.id, name: participant.name });
});

// ============================================================
// ===== API: レース結果(所持金)の送信 =====
//   POST /api/result   body: { id, balance, net }
//   → 該当参加者の所持金・収支を更新する
// ============================================================
app.post('/api/result', (req, res) => {
  const { id, balance, net } = req.body || {};

  // id で参加者を探す
  const participant = participants.find(p => p.id === id);
  if (!participant) {
    // 知らない id(サーバ再起動後など)。エラーにせず「未登録」を伝える。
    return res.status(404).json({ ok: false, reason: 'unknown id' });
  }

  // 数値として受け取って上書きする
  participant.balance = Number(balance) || 0;
  participant.net = Number(net) || 0;
  participant.updatedAt = Date.now();   // 同点時の並び順に使う

  console.log(`結果更新: ${participant.id} / ${participant.name} → 所持金 ${participant.balance}円 (収支 ${participant.net})`);
  res.json({ ok: true });
});

// ============================================================
// ===== API: ランキング取得 =====
//   GET /api/ranking
//   → 全参加者を所持金の多い順に並べた配列を返す
// ============================================================
app.get('/api/ranking', (req, res) => {
  const ranking = computeRanking(participants);
  res.json(ranking);
});

// ============================================================
// ===== QRコード画像を返す =====
//   GET /qr
//   → このサーバ自身のURL(例 http://192.168.1.5:3000/)を
//      指すQRコードをPNG画像で返す。
//   参加者がスマホで読み取ると、そのままゲームに飛べる。
//   (req.headers.host は「アクセスに使われたホスト:ポート」なので、
//    PCのIPでアクセスしていれば、その同じURLのQRが作られる)
// ============================================================
app.get('/qr', async (req, res) => {
  try {
    // トンネル越しのときは https、ローカル直アクセスのときは http になる。
    // (X-Forwarded-Proto はトンネル/プロキシが付けてくれる転送元のプロトコル)
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const url = `${proto}://${req.headers.host}/`;
    // QRコードをPNGの画像データ(バッファ)として作る
    const pngBuffer = await QRCode.toBuffer(url, { width: 240, margin: 1 });
    res.type('png');
    res.send(pngBuffer);
  } catch (err) {
    console.log('QR生成エラー:', err);
    res.status(500).send('QR生成に失敗しました');
  }
});

// ============================================================
// ===== サーバを起動する =====
// ============================================================
app.listen(PORT, () => {
  console.log(`競馬ゲームサーバ起動: http://localhost:${PORT} でリクエスト待受中...`);
  console.log('同じWi-FiのスマホからはPCのIPアドレス(例 http://192.168.x.x:' + PORT + ')でアクセスできます。');
});
