/**
 * layout.js
 * --------------------------------------------------
 * 共通レイアウト要素（ヘッダー/フッター）を動的に読み込むスクリプト。
 * 言語切り替え、ナビゲーションのアクティブ状態、
 * モバイルメニュートグルを管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  const shell =
    document.querySelector(".page-shell") || document.body;

  const currentPath = (() => {
    const name = location.pathname.split("/").pop();
    return name && name.length > 0 ? name : "index.html";
  })();

  // layout.js の読み込みパスから相対パスを特定する
  const getPartialsPath = () => {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src");
      if (src && src.endsWith("layout.js")) {
        // "assets/js/layout.js" の前の部分を取得
        const prefix = src.replace(
          "assets/js/layout.js",
          "",
        );
        return prefix + "partials/";
      }
    }
    return "partials/";
  };

  const pathToPartials = getPartialsPath();
  const lang = document.documentElement.lang;
  const headerFile =
    lang === "en" ? "header_en.html" : "header.html";

  Promise.all([
    fetch(`${pathToPartials}${headerFile}`).then((r) =>
      r.text(),
    ),
    fetch(`${pathToPartials}footer.html`).then((r) =>
      r.text(),
    ),
  ])
    .then(([headerHtml, footerHtml]) => {
      shell.insertAdjacentHTML("afterbegin", headerHtml);
      shell.insertAdjacentHTML("afterend", footerHtml);

      // 言語切り替え
      const langSwitch =
        document.querySelector(".lang-switch");
      if (langSwitch) {
        const isEn = document.documentElement.lang === "en";
        const search = window.location.search || "";
        const targetUrl = isEn
          ? `../${currentPath}${search}`
          : `en/${currentPath}${search}`;
        langSwitch.setAttribute("href", targetUrl);
      }

      const navLinks =
        document.querySelectorAll(".site-nav a");
      navLinks.forEach((link) => {
        const target =
          link.getAttribute("data-nav") ||
          link.getAttribute("href") ||
          "";

        const cleanTarget = target.split(/[?#]/)[0];

        if (cleanTarget === currentPath) {
          link.classList.add("active");
        }
      });

      const navToggle =
        document.querySelector(".nav-toggle");
      const siteNav = document.querySelector(".site-nav");

      if (navToggle && siteNav) {
        navToggle.addEventListener("click", () => {
          navToggle.classList.toggle("is-active");
          siteNav.classList.toggle("is-open");
          document.documentElement.classList.toggle(
            "no-scroll",
            siteNav.classList.contains("is-open"),
          );
          document.body.classList.toggle(
            "no-scroll",
            siteNav.classList.contains("is-open"),
          );
        });

        siteNav.querySelectorAll("a").forEach((link) => {
          link.addEventListener("click", () => {
            navToggle.classList.remove("is-active");
            siteNav.classList.remove("is-open");
            document.documentElement.classList.remove(
              "no-scroll",
            );
            document.body.classList.remove("no-scroll");
          });
        });
      }
    })
    .catch((err) => {
      console.error(
        "共通ヘッダー/フッター読み込みエラー:",
        err,
      );
    });
});
