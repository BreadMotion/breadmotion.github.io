# WebSite構成ドキュメント

## 概要

`WebSite/` フォルダは、breadmotion プロジェクトの公開Webサイトを構成するファイルのルートディレクトリです。日本語版と英語版の両言語対応サイトで、以下のセクション・機能を含みます：

- トップページ（プロフィール、おすすめ機能表示）
- ブログシステム（38記事以上を管理）
- ポートフォリオ（作品紹介）
- プロダクト紹介
- お問い合わせフォーム

---

## ディレクトリ構造

```
WebSite/
├── index.html                    # トップページ（日本語）
├── blog.html                     # ブログ一覧（日本語）
├── portfolio.html                # ポートフォリオ一覧（日本語）
├── products.html                 # プロダクト一覧（日本語）
├── contact.html                  # お問い合わせフォーム（日本語）
├── en/                           # 英語版ディレクトリ
│   ├── index.html
│   ├── blog.html
│   ├── portfolio.html
│   ├── products.html
│   └── contact.html
├── blog/                         # ブログ記事詳細ページ（日本語）
│   ├── blog_00001.html
│   ├── blog_00002.html
│   └── ... (blog_00038.html まで)
├── en/blog/                      # ブログ記事詳細ページ（英語版）
│   ├── blog_00001.html
│   ├── blog_00002.html
│   └── ...
├── portfolio/                    # ポートフォリオ詳細ページ
│   ├── portfolio_0001.html
│   ├── portfolio_0002.html
│   └── portfolio_0003.html
├── partials/                     # 共通部品
│   ├── header.html               # ヘッダー（日本語）
│   ├── footer.html               # フッター（共通）
│   └── header_en.html            # ヘッダー（英語）
└── assets/                       # 静的資産
    ├── css/                      # スタイルシート
    ├── img/                      # 画像リソース
    ├── data/                     # JSONデータファイル
    └── dist/                     # ビルド済みファイル
```

---

## ページ構成詳細

### トップページ（index.html / en/index.html）

トップページの基本セクション構成：

1. **hero** - ヒーロー領域（メインビジュアル）
2. **profile** - プロフィール紹介
3. **top-grid** - グリッドレイアウト表示
4. **recommend** - おすすめコンテンツ
5. **feature** - 機能紹介

### ブログシステム

#### ブログ一覧ページ（blog.html）

- ブログ記事の一覧表示
- フィルタリング機能セクション（カテゴリ、タグなど）
- ページネーション対応

#### ブログ記事詳細ページ（blog/blog_XXXXX.html）

各記事ページのセクション構成：

1. **breadcrumb** - パンくずナビゲーション
2. **post-detail** - 記事本体
3. **share-buttons** - SNS共有ボタン
4. **like/bookmark** - いいね・ブックマーク機能
5. **toc** - 目次（Table of Contents）
6. **related** - 関連記事

### ポートフォリオ

#### ポートフォリオ一覧ページ（portfolio.html）

- 作品をカード形式で表示
- グリッドレイアウト

#### ポートフォリオ詳細ページ（portfolio/portfolio_XXXX.html）

- 作品の詳細情報
- スクリーンショット、説明文など

### プロダクトページ（products.html）

- プロダクト一覧
- 各プロダクトの説明

### お問い合わせページ（contact.html）

- 問い合わせフォーム
- バリデーション機能
- 送信機能

---

## ディレクトリ別役割

### assets/css/ - スタイルシート

複数のCSSファイルに機能ごと分割して管理：

| ファイル | 役割 |
|---------|------|
| **base.css** | グローバルスタイル、リセットCSS |
| **layout.css** | レイアウト構造（グリッド、フレックスボックス） |
| **top.css** | トップページ固有スタイル |
| **portfolio.css** | ポートフォリオページスタイル |
| **blog.css** | ブログページスタイル |
| **contact.css** | お問い合わせフォームスタイル |
| **post-interactions.css** | 記事内インタラクション（いいね、シェア等） |
| **styles.min.css** | ミニファイされた統合CSS（本番用） |

### assets/img/ - 画像リソース

- ロゴ
- アイコン
- ポートフォリオの写真
- アイキャッチ画像
- など

### assets/data/ - データファイル

JSON形式のメタデータファイル：

| ファイル | 用途 |
|---------|------|
| **blogList.json** | ブログ記事一覧メタデータ（日本語） |
| **blogList_en.json** | ブログ記事一覧メタデータ（英語） |
| **portfolioList.json** | ポートフォリオメタデータ |
| **popular.json** | 人気記事リスト |

### assets/dist/ - ビルド済みファイル

バンドルされた本番環境用ファイル（JS、最小化CSS等）

### partials/ - 共通部品

HTML共通部品：

- **header.html** - ページヘッダー（ナビゲーション含む、日本語版）
- **header_en.html** - ページヘッダー（英語版）
- **footer.html** - ページフッター（共通で複数言語対応）

---

## 言語対応

### ディレクトリ構成

```
WebSite/
├── 日本語版
│   ├── index.html
│   ├── blog.html, blog/, 関連ファイル
│   └── portfolio.html, portfolio/, 関連ファイル
└── en/
    ├── index.html
    ├── blog.html, blog/, 関連ファイル
    └── portfolio.html, portfolio/, 関連ファイル
```

### データファイル

- `blogList.json` - 日本語版ブログメタデータ
- `blogList_en.json` - 英語版ブログメタデータ

### ヘッダー管理

- `partials/header.html` - 日本語ヘッダー
- `partials/header_en.html` - 英語ヘッダー
- `partials/footer.html` - 共通フッター

---

## ページテンプレート構造

### 標準テンプレート

すべてのHTMLページは以下の基本構造に従う：

```html
<!DOCTYPE html>
<html>
<head>
  <!-- メタ情報 -->
  <!-- CSS読み込み -->
</head>
<body>
  <!-- Header (partials/header.html または header_en.html) -->
  
  <!-- Main Content -->
  
  <!-- Footer (partials/footer.html) -->
  
  <!-- Scripts -->
</body>
</html>
```

### セクション命名規則

ページ内の主要コンテンツセクションは以下の命名規則を使用：

- `hero` - ヒーロー領域
- `profile` - プロフィール
- `top-grid` - グリッド表示
- `feature` - 機能紹介
- `post-detail` - 記事詳細本体
- `share-buttons` - 共有ボタン
- `toc` - 目次
- `related` - 関連コンテンツ
- `breadcrumb` - パンくずナビゲーション

---

## CSS組織の特徴

### モジュラー構成

各ページの独特なスタイルは専用CSSファイルで管理し、共通スタイルは `base.css` と `layout.css` で集約します。

### 本番環境

- **開発時**: 個別CSSファイルを分割利用
- **本番環境**: `styles.min.css` でミニファイされた統合版を使用

### CSS読み込み順序

1. base.css（基本スタイル）
2. layout.css（レイアウト）
3. ページ固有CSS（top.css, blog.css 等）
4. post-interactions.css（動的インタラクション）

---

## 運用上の注意事項

### ブログ記事追加時

1. `blog/blog_XXXXX.html` に新規記事を作成
2. `en/blog/blog_XXXXX.html` に英語版を作成
3. `assets/data/blogList.json` と `blogList_en.json` にメタデータを追加

### ポートフォリオ追加時

1. `portfolio/portfolio_XXXX.html` に新規作品ページを作成
2. `assets/data/portfolioList.json` にメタデータを追加
3. 必要に応じて画像を `assets/img/` に配置

### スタイル追加時

- ページ全体に関わる変更 → `base.css` または `layout.css`
- 特定ページの変更 → 各ページ固有CSSファイル
- インタラクション関連 → `post-interactions.css`

---

## 参考リンク

- ブログシステム詳細：各 `blog_XXXXX.html`
- ポートフォリオ構成：各 `portfolio_XXXX.html`
- 共通部品：`partials/` フォルダ
