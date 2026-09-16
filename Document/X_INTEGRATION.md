# X 埋め込み運用の整理

現在のサイトでは、X API の自動取得を止め、最新の投稿を手動で埋め込む方式に切り替えています。

## 変更概要
- X API を使った自動取得は廃止しました。
- `WebSite/index.html` と `WebSite/en/index.html` では `platform.twitter.com/widgets.js` を利用して、手動で記載した投稿リンクを埋め込み表示します。
- `.github/workflows/fetch-x-feed.yml` は失敗を繰り返すため、運用停止（ファイル名 `.disabled` へのリネーム）しています。

## 代表的な埋め込み方法

### 1) 手動埋め込み（現在の方法）
```html
<div id="xMediaFeed" class="home-x-feed">
  <blockquote class="twitter-tweet" data-dnt="true" data-theme="dark">
    <a href="https://x.com/pankun2000_/status/2085574143513342190?s=20">View on X</a>
  </blockquote>
</div>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
```

### 2) ウィジェットサービスの利用
- EmbedSocial
- Tagembed
- CollectSocials

無料プランが使える場合は、これらのサービスの埋め込みコードをサイトへ差し込む形で運用できます。

## 注意事項
- X API では、有料枠の取得と利用可能枠の消費が前提であるため、無料で継続運用するのは難しいです。
- 今の実装は手動更新を前提にしているため、投稿を追加・更新するたびにページ側の URL を更新してください。
- もし今後自動化を再導入する場合は、X API と有料枠の契約が必要です。


注意: ビルド時に publish.x.com から埋め込み HTML を取得してページに埋め込む仕組みを導入しました。取得に失敗した場合は従来どおりの blockquote ベースの埋め込みにフォールバックします。キャッシュは WebSite/.cache/x-embeds に保存され、デフォルトの有効期限は 7 日です。
