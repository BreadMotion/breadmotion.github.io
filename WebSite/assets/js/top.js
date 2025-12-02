/**
 * top.js
 * --------------------------------------------------
 * トップページ専用スクリプト。
 * ヒーロースライドショー、最新ブログ/ポートフォリオ一覧を表示。
 * --------------------------------------------------
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const da = ("0" + d.getDate()).slice(-2);
  return `${y}/${m}/${da}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const blogListEl = document.getElementById(
    "homeLatestBlog",
  );
  const portListEl = document.getElementById(
    "homeLatestPortfolio",
  );
  const slideshowEl =
    document.getElementById("heroSlideshow");

  if (!blogListEl && !portListEl && !slideshowEl) return;

  const lang = document.documentElement.lang;
  const isEn = lang === "en";
  const relativePrefix = isEn ? "../" : "";

  if (slideshowEl) {
    try {
      const res = await fetch(
        `${relativePrefix}assets/data/portfolioList.json`,
      );
      if (res.ok) {
        let items = await res.json();
        items = items.filter((item) => item.thumbnail);

        if (items.length > 0) {
          // Fisher-Yates shuffle
          for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
          }

          let currentIndex = 0;
          const showNextSlide = () => {
            const item = items[currentIndex];
            const slide = document.createElement("div");
            slide.className = "hero-slide";

            let thumbUrl = item.thumbnail;
            if (
              isEn &&
              thumbUrl &&
              !thumbUrl.startsWith("http")
            ) {
              thumbUrl = relativePrefix + thumbUrl;
            }

            slide.style.backgroundImage = `url('${thumbUrl}')`;

            slideshowEl.appendChild(slide);

            // Reflow
            void slide.offsetWidth;

            slide.classList.add("active");

            // 古いスライドを削除
            setTimeout(() => {
              while (slideshowEl.children.length > 1) {
                slideshowEl.removeChild(
                  slideshowEl.firstElementChild,
                );
              }
            }, 2500);

            currentIndex =
              (currentIndex + 1) % items.length;
          };

          showNextSlide();
          setInterval(showNextSlide, 6000);
        }
      }
    } catch (err) {
      console.error("Hero slideshow error:", err);
    }
  }

  if (blogListEl) {
    try {
      const jsonPath = isEn
        ? `${relativePrefix}assets/data/blogList_en.json`
        : `${relativePrefix}assets/data/blogList.json`;

      const res = await fetch(jsonPath);
      if (!res.ok) throw new Error(res.statusText);
      const posts = await res.json();

      posts.sort((a, b) => {
        const da = a.date ? new Date(a.date) : new Date(0);
        const db = b.date ? new Date(b.date) : new Date(0);
        return db - da;
      });

      const latest = posts.slice(0, 3);

      if (latest.length === 0) {
        blogListEl.innerHTML =
          "<li>まだ記事がありません。</li>";
      } else {
        latest.forEach((post) => {
          const li = document.createElement("li");
          li.className = "home-latest-item";

          const a = document.createElement("a");
          a.className = "home-latest-link";
          a.href = relativePrefix + post.contentPath;

          const titleSpan = document.createElement("span");
          titleSpan.className = "home-latest-link-title";
          titleSpan.textContent = post.title;

          const metaSpan = document.createElement("span");
          metaSpan.className = "home-latest-link-meta";
          const categoryText = post.category
            ? ` / ${post.category}`
            : "";
          const dateText = formatDate(post.date);
          metaSpan.textContent = `${dateText}${categoryText}`;

          const div = document.createElement("div");
          div.className = "home-latest-link-thumbnail";

          const img = document.createElement("img");
          img.src = relativePrefix + post.thumbnail;

          a.appendChild(titleSpan);
          a.appendChild(metaSpan);
          a.appendChild(div);
          li.appendChild(a);
          blogListEl.appendChild(li);
          div.appendChild(img);
        });
      }
    } catch (err) {
      console.error("home latest blog error:", err);
      blogListEl.innerHTML =
        "<li>ブログ一覧を読み込めませんでした。</li>";
    }
  }

  if (portListEl) {
    try {
      const res = await fetch(
        `${relativePrefix}assets/data/portfolioList.json`,
      );
      if (!res.ok) throw new Error(res.statusText);
      const works = await res.json();

      const latest = works.slice(0, 3);

      if (latest.length === 0) {
        portListEl.innerHTML =
          "<li>まだ作品がありません。</li>";
      } else {
        latest.forEach((work) => {
          const li = document.createElement("li");
          li.className = "home-latest-item";

          const a = document.createElement("a");
          a.setAttribute("data-no-preview", "");
          a.href = "#";

          a.addEventListener("click", (e) => {
            e.preventDefault();
            if (
              work.contentPath &&
              window.openPortfolioModal
            ) {
              const contentPath =
                relativePrefix + work.contentPath;

              // On the top page, if a tag link in the modal is clicked,
              // navigate to the portfolio list page with that tag filtered.
              const linkHandler = (tag) => {
                const portfolioUrl = "portfolio.html";
                if (tag) {
                  window.location.href = `${portfolioUrl}?tag=${encodeURIComponent(
                    tag,
                  )}`;
                } else {
                  window.location.href = portfolioUrl;
                }
              };

              window.openPortfolioModal(
                contentPath,
                isEn,
                linkHandler,
              );
            }
          });

          const titleSpan = document.createElement("span");
          titleSpan.className = "home-latest-link-title";
          titleSpan.textContent = work.title;

          const metaSpan = document.createElement("span");
          metaSpan.className = "home-latest-link-meta";
          const parts = [];
          if (work.tech) parts.push(work.tech);
          if (work.platform) parts.push(work.platform);
          metaSpan.textContent = parts.join(" / ");

          a.appendChild(titleSpan);
          a.appendChild(metaSpan);

          if (work.thumbnail) {
            const div = document.createElement("div");
            div.className = "home-latest-link-thumbnail";
            const img = document.createElement("img");
            img.src = relativePrefix + work.thumbnail;
            img.alt = "";
            div.appendChild(img);
            a.appendChild(div);
          }

          li.appendChild(a);
          portListEl.appendChild(li);
        });
      }
    } catch (err) {
      console.error("home latest portfolio error:", err);
      portListEl.innerHTML =
        "<li>作品一覧を読み込めませんでした。</li>";
    }
  }
});
