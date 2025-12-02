/**
 * @file locales/static.js
 * @description 静的 HTML 翻訳用の多言語ロケール定義（英語版）
 * @summary
 *   - index.html, blog.html, portfolio.html, contact.html の翻訳データ
 *   - CSS セレクタベースで翻訳対象を指定
 *   - translate-static.js から参照
 * @recent_changes
 *   - products.html を削除し、portfolio.html へリダイレクトするよう変更
 */

module.exports = {
  en: {
    // -------------------------------------------------------------------------
    // Common (Header, Footer, Meta, etc.)
    // -------------------------------------------------------------------------
    common: {
      html: { attr: "lang", value: "en" },

      // Header Navigation
      ".site-nav a[data-nav='index.html']": "Home",
      ".site-nav a[data-nav='blog.html']": "Blog",
      ".site-nav a[data-nav='portfolio.html']": "Portfolio",
      ".site-nav a[data-nav$='contact.html']": "Contact",

      // Footer
      ".site-footer__left": "© 2025 PanKUN",
    },

    // -------------------------------------------------------------------------
    // index.html
    // -------------------------------------------------------------------------
    index: {
      title: "PanKUN | Portfolio",
      "meta[name='description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio",
      },
      "meta[property='og:title']": {
        attr: "content",
        value: "PanKUN Portfolio | pankun.dev",
      },
      "meta[property='og:description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio",
      },
      "meta[name='twitter:title']": {
        attr: "content",
        value: "PanKUN Portfolio | pankun.dev",
      },
      "meta[name='twitter:description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio",
      },

      // Hero
      ".hero-subtitle": "Client / Tool / Server Engineer",

      // Side
      ".hero-side h2": "Recent Updates",
      ".home-latest-title:contains('Latest Blog')":
        "Latest Blog",
      ".home-latest-title:contains('Latest Portfolio')":
        "Latest Portfolio",

      // Profile (#about)
      "#about .section__title": "About / Profile",

      // Card: Experience
      ".card__title:contains('経験')": "Experience",
      ".profile-label:contains('学生開発')": "Student Dev",
      ".profile-value:contains('約 4 年')":
        "Approx. 4 years",
      ".profile-label:contains('業務')":
        "Professional / Personal",
      ".profile-value:contains('約 2.5 年')":
        "Approx. 2.5 years",
      ".profile-note:contains('学生時代から')":
        "Aiming for a position with high commitment and wide coverage, involving not only game development but also tools and infrastructure since student days.",

      // Card: Tech Stack
      ".card__title:contains('Tech Stack')": "Tech Stack",

      // Card: Focus
      ".card__title:contains('Focus')": "Focus / Expertise",
      ".profile-label:contains('ゲームクライアント')":
        "Game Client",
      ".profile-value:contains('ゲームロジック')":
        "Game Logic / Core Logic / Asset Ops / UI/UX / Effects",
      ".profile-label:contains('ツール開発')": "Tool Dev",
      ".profile-value:contains('Discord Bot')":
        "Discord Bot / Slack Bot / Automation / CI/CD / Internal Tools / API Dev",
      ".profile-label:contains('インフラ遊び')":
        "Infrastructure",
      ".profile-value:contains('自宅常駐サーバー')":
        "Home Server (Discord Bot, API Minecraft, Tunneling)",
      ".profile-note:contains('とりあえず必要なもの')":
        "Adopting a 'build it yourself if needed' style, I often work on environment setups around client development.",

      // Contents
      ".section--top-grid .section__title": "Contents",

      ".card--link:has(h3:contains('Blog')) p":
        "Technical notes and dev logs",
      ".card--link:has(h3:contains('Blog')) .card__more":
        "Go to Blog List →",

      ".card--link:has(h3:contains('Portfolio')) p":
        "Introduction of created games and tools.",
      ".card--link:has(h3:contains('Portfolio')) .card__more":
        "Go to Portfolio List →",

      ".card--link:has(h3:contains('Contact')) p":
        "Business inquiries, etc.",
      ".card--link:has(h3:contains('Contact')) .card__more":
        "Contact →",

      // Recommend
      ".section--recommend .section__title":
        "Recommended Articles",

      // Features
      ".section--feature .section__title":
        "Features / Future Plans",

      "article h3:contains('Contactページの開発')":
        "Contact Page Dev",
      "article p:contains('お問い合わせフォーム')":
        "Implementing the contact form content. (Currently disabled due to network restrictions)",

      "article h3:contains('UI/UXの改善')":
        "UI/UX Improvement",
      "article p:contains('ユーザー体験向上')":
        "Redesign for better user experience.",

      "article h3:contains('コンテンツ拡充')":
        "Content Expansion",
      "article p:contains('新しいブログ記事')":
        "Adding new blog posts and portfolio items.",

      "article h3:contains('プロダクトの拡充')":
        "Product Expansion",
      "article p:contains('主に下記の開発')":
        "Mainly developing and selling:<br>- Unity games, tools<br>- UE games, tools<br>- Discord bot features",
    },

    // -------------------------------------------------------------------------
    // blog.html
    // -------------------------------------------------------------------------
    blog: {
      title: "PanKUN | Blog",
      "meta[name='description']": {
        attr: "content",
        value: "Engineer PanKUN Technical Blog",
      },
      "meta[property='og:description']": {
        attr: "content",
        value: "Engineer PanKUN Technical Blog",
      },
      "meta[name='twitter:description']": {
        attr: "content",
        value: "Engineer PanKUN Technical Blog",
      },

      ".page-header h1": "Blog",
      ".page-header p":
        "Technical notes and knowledge regarding game development, including Unity, UE5, and tool development.",

      ".section-header h2": "Articles",

      ".blog-filter__label:contains('カテゴリ')":
        "Category",
      "#blogCategoryFilter option[value='']": "All",

      ".blog-filter__label:contains('検索')": "Search",
      "#blogSearch": {
        attr: "placeholder",
        value: "Search by title, description, or tags",
      },

      "#blogEmptyMessage":
        "No articles match the criteria.",
    },

    // -------------------------------------------------------------------------
    // portfolio.html
    // -------------------------------------------------------------------------
    portfolio: {
      title: "PanKUN | Portfolio",
      "meta[name='description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio List",
      },
      "meta[property='og:title']": {
        attr: "content",
        value: "PanKUN Portfolio | pankun.dev",
      },
      "meta[property='og:description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio List",
      },
      "meta[name='twitter:title']": {
        attr: "content",
        value: "PanKUN Portfolio | pankun.dev",
      },
      "meta[name='twitter:description']": {
        attr: "content",
        value: "Engineer PanKUN Portfolio List",
      },

      ".page-header h1": "Portfolio",
      ".page-header p:contains('制作したゲーム')":
        "Summarizing created games, tools, and participating projects.",
      ".page-header p:contains('個人制作')":
        "Publishing personal works, indie games, and professional involvements as much as possible.",

      ".section-header h2": "Works List",

      ".portfolio-filter__label:contains('カテゴリ')":
        "Category",
      "#portfolioCategoryFilter option[value='']": "All",

      ".portfolio-filter__label:contains('検索')": "Search",
      "#portfolioSearch": {
        attr: "placeholder",
        value: "Search by title, description, or tags",
      },

      "#portfolioEmptyMessage":
        "No works match the criteria.",
    },

    // -------------------------------------------------------------------------
    // contact.html
    // -------------------------------------------------------------------------
    contact: {
      title: "PanKUN | Contact",
      "meta[name='description']": {
        attr: "content",
        value: "Engineer PanKUN Contact Page",
      },
      "meta[property='og:title']": {
        attr: "content",
        value: "PanKUN Contact | pankun.dev",
      },
      "meta[property='og:description']": {
        attr: "content",
        value: "Engineer PanKUN Contact Page",
      },
      "meta[name='twitter:title']": {
        attr: "content",
        value: "PanKUN Contact | pankun.dev",
      },
      "meta[name='twitter:description']": {
        attr: "content",
        value: "Engineer PanKUN Contact Page",
      },

      ".page-header h1": "Contact",
      ".page-header p:contains('お仕事のご相談')":
        "Please use the form below for work inquiries or contacting me.",
      ".page-header .text-muted":
        'If you wish to send an email directly, please contact <a href="mailto:pankun.eng@gmail.com" class="link-text">pankun.eng@gmail.com</a>.',

      ".section-header h2": "Contact Form",

      "label[for='name']":
        'Name <span class="badge-required">Required</span>',
      "#name": {
        attr: "placeholder",
        value: "Taro Yamada",
      },

      "label[for='email']":
        'Email <span class="badge-required">Required</span>',
      "#email": {
        attr: "placeholder",
        value: "example@email.com",
      },

      "label[for='phone']":
        'Phone Number <span class="badge-optional">Optional</span>',
      "#phone": {
        attr: "placeholder",
        value: "090-0000-0000",
      },

      "label[for='message']":
        'Message <span class="badge-required">Required</span>',
      "#message": {
        attr: "placeholder",
        value: "Please enter your inquiry here.",
      },

      ".btn-text": "Submit",
    },
  },
};
