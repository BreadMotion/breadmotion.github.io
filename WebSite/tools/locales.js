/**
 * @file locales.js
 * @description ブログ生成用の多言語ロケール定義
 * @summary
 *   - 日本語 (ja) と英語 (en) のサイトタイトル、パンくずリスト、共有ボタンなどの文言を管理
 *   - build-blog.js から参照
 * @recent_changes
 *   - ファイル先頭に説明コメントを追加
 */

module.exports = {
  ja: {
    lang: "ja",
    site_title_suffix: " | PanKUN Blog",
    breadcrumb_home: "ホーム",
    breadcrumb_blog: "ブログ",
    share_title: "SHARE",
    share_label_suffix: "でシェア",
    toc_title: "目次",
    toc_button_label: "目次を開く",
    toc_button_text: "目次",
    back_to_blog: "← ブログ一覧へ戻る",
    recommended_title: "おすすめ記事",
    related_title: "関連記事",
  },
  en: {
    lang: "en",
    site_title_suffix: " | PanKUN Blog",
    breadcrumb_home: "Home",
    breadcrumb_blog: "Blog",
    share_title: "SHARE",
    share_label_suffix: " Share",
    toc_title: "Table of Contents",
    toc_button_label: "Open Table of Contents",
    toc_button_text: "TOC",
    back_to_blog: "← Back to Blog",
    recommended_title: "Recommended",
    related_title: "Related Posts",
  },
};
