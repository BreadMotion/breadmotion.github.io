document.addEventListener("DOMContentLoaded", () => {
  if (!document.startViewTransition) {
    return;
  }

  // ページ遷移のイベントハンドラー
  document.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault(); // デフォルトのリンク動作を無効化
      const url = link.href;

      document.startViewTransition(() => {
        window.location.href = url; // ページの遷移を実行
        return new Promise((resolve) => {
          window.addEventListener("load", resolve); // ページが完全に読み込まれたら解決
        });
      });
    });
  });
});
