# PanKUN Home Page へようこそ

![image](WebSite/assets/img/ogp.png)

下記ページが記載されている自作ホームページです。

- 技術Blog
- Product(Tool, Game, 資料等)

ページは[こちら](https://breadmotion.github.io/WebSite/)

## CSS 未使用検出

WebSite 側のビルドでは未使用 CSS の検出ができます。

- `cd WebSite && npm run build:refactor`
  - 未使用と判定されたセレクタを dry-run で表示します。
- `cd WebSite && npm run build:refactor:apply`
  - 未使用セレクタをコメント化し、対象ファイルの `.bak` を自動保存します。

注意: 生成されるクラス名が JavaScript で動的に組み立てられる場合は誤検知が起こる可能性があります。実行前に `.bak` を確認してから本番反映してください。
