# X (旧 Twitter) フィード自動取得の設定

このプロジェクトは指定した X アカウントの「メディア」投稿を最新順で抽出し、WebSite/assets/x-feed.json に出力してクライアントで表示します。

## 概要
- GitHub Actions (.github/workflows/fetch-x-feed.yml) が X API を利用して投稿を取得し、oEmbed を使って埋め込み HTML を生成します。
- 生成されるファイル: WebSite/assets/x-feed.json
- クライアント側スクリプト: WebSite/assets/js/x-feed.js（index.html と en/index.html に読み込みを追加済み）

## X_BEARER_TOKEN を GitHub Secret に登録する方法（最短手順）

### 1) X Developer Portal で Bearer Token を取得する
1. https://developer.x.com/en/portal/dashboard にアクセス
2. X アカウントでログイン
3. まだアプリを作っていなければ「Create Project」→「Create App」からアプリを作成
4. 作成したアプリの「Keys and tokens」または「Authentication tokens」画面を開く
5. 「Bearer token」欄に表示される値をコピーする
   - これは長い文字列です。
   - これは API key / API secret ではなく「Bearer token」である必要があります。

### 2) GitHub のリポジトリ設定で secret を登録する
1. GitHub で対象リポジトリを開く
2. 右上の「Settings」へ進む
3. 左側メニューの「Secrets and variables」→「Actions」を開く
4. 「New repository secret」を押す
5. Name に `X_BEARER_TOKEN` と入力
6. Value に、上でコピーした Bearer token をそのまま貼り付ける
7. 「Add secret」で保存

これで GitHub Actions のワークフロー側で `${{ secrets.X_BEARER_TOKEN }}` として使えます。

### 3) .env ファイルに入れる必要はありますか？
いいえ、GitHub Actions では通常 `.env` に入れません。
- .env はローカル開発環境で使うファイルです。
- GitHub Actions では、GitHub の「Secrets」機能を使います。
- その値は GitHub 側で安全に保存され、ワークフローの実行時だけ渡されます。

## ワークフローの使い方
- 手動実行: GitHub Actions の `Fetch X media feed` ワークフローを workflow_dispatch で実行できます。Username を指定しなければ `pankun2000_` が使われます。
- 自動実行: ワークフローは daily のスケジュールで実行されます（cron: 0 0 * * *）。

## 埋め込み方法（任意のページ）
- 任意ページで以下のようにプレースホルダを置くと、その場所に投稿が埋め込まれます（native_embed を推奨）。

```html
<div class="x-embed" data-x-url="https://x.com/{username}/status/{statusId}"></div>
```

## 注意事項
- X API のアクセス制限や仕様変更によりワークフローが動作しなくなる場合があります。その場合は `Document/X_INTEGRATION.md` を更新してください。
- assets/x-feed.json はワークフローが生成しコミットします。手動で更新することも可能です。
- もし Factor/Organization の設定で Action Secrets を使えない場合は、対象リポジトリもしくは Organization の Secrets を確認してください。