# ☁️ Render で常時公開する手順（案B）

固定の公開URL（例: `https://keiba-game.onrender.com`）を取得し、**スライドにそのQRを載せる**ための手順です。
データはメモリ保持のまま（無料枠のスリープでランキングがリセットされる仕様でOK）。

> 下準備はこちらで完了済みです:
> - `app.js` を `process.env.PORT` 対応に修正（Renderが渡すポートで起動）
> - `.gitignore` / `render.yaml` / QR生成スクリプト追加
> - このフォルダを Git リポジトリ化し、初回コミット済み（`main` ブランチ）

---

## 全体の流れ

```
このPC(コミット済み) ──push──▶ GitHub(リポジトリ) ──連携──▶ Render(常時公開URL)
                                                              │
                                                  そのURLでQRを作る → スライドに載せる
```

---

## STEP 1. GitHub にリポジトリを作る（ブラウザ）

1. https://github.com/new を開く（無料アカウントが必要。無ければ作成）
2. **Repository name**: `keiba-game`（任意）
3. **Public** を選択
4. **「Add a README」などのチェックは付けない**（空のリポジトリにする）
5. 「Create repository」

作成後に表示される `https://github.com/＜あなた＞/keiba-game.git` を控えます。

## STEP 2. このPCから push（PowerShell）

このフォルダで次を実行（`＜あなた＞` は自分のユーザー名に置き換え）:

```powershell
cd C:\Users\SaekoSeki\ica_sample\0623_game_LT
git remote add origin https://github.com/＜あなた＞/keiba-game.git
git push -u origin main
```

- 初回pushで GitHub のログイン画面（ブラウザ）が出たらログイン＆許可
  （Git for Windows の Credential Manager が自動で開きます）
- 完了後、GitHub のページを更新するとファイルが上がっているはず

## STEP 3. Render でデプロイ（ブラウザ）

1. https://render.com にアクセスし、**GitHubアカウントでサインアップ/ログイン**
   （クレジットカード不要）
2. 右上 **New +** → **Web Service**
3. **Connect** で先ほどの `keiba-game` リポジトリを選ぶ
   （`render.yaml` を使う場合は New + → **Blueprint** を選んでも可）
4. 設定が自動で埋まる（埋まらなければ手入力）:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
5. **Create Web Service** → ビルド〜起動を待つ（数分）
6. 画面上部に **公開URL**（例 `https://keiba-game.onrender.com`）が表示されたら成功

> 動作確認: そのURLを開いてゲームが表示され、名前を入れて参加 → ランキングが出ればOK。
> 無料枠は約15分アクセスが無いとスリープし、次のアクセスで数十秒かかります（その際ランキングはリセット）。

## STEP 4. スライド用のQRを作る（PowerShell）

公開URLが決まったら、このフォルダで:

```powershell
npm run qr -- https://keiba-game.onrender.com
```

- `qr.png` がそのURLを指すQRに更新されます
- `slides.md` は `qr.png` を参照しているので、**スライドのQRが自動で差し替わります**
- （PDF/PPTXに書き出している場合は再エクスポートしてください）

---

## 更新したくなったら（コードを直したとき）

```powershell
git add -A
git commit -m "変更内容"
git push
```
→ Render が自動で再ビルド・再デプロイします（URLは変わりません）。

---

## つまずきポイント

| 症状 | 対処 |
|------|------|
| push でユーザー名/パスワードを聞かれる | パスワードではなく**ブラウザ認証**（Credential Manager）。出ない場合は GitHub の Personal Access Token を使用 |
| Render でビルド失敗 | ログを確認。`package.json` の `start` が `node app.js` か、`engines` の Node バージョンを確認 |
| 開くのに数十秒かかる | 無料枠スリープからの復帰（仕様）。常時起動したい場合は有料プラン |
| ランキングが消えた | スリープ/再デプロイでメモリがリセット（仕様。今回はこれでOKとしている） |
