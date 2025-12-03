/**
 * contact.js
 * --------------------------------------------------
 * お問い合わせフォーム用スクリプト。
 * Google Apps Script (GAS) へのフォーム送信を管理。
 * --------------------------------------------------
 */
document.addEventListener("DOMContentLoaded", () => {
  // =================================================================
  // 設定: Google Apps Script (GAS) のデプロイURL
  // =================================================================
  const GAS_API_URL =
    "https://script.google.com/macros/s/AKfycbxeCtBCIfYuaef4XG0PrmoyFnBqbx02IjX_ecNd-6Qu-GETA_7vLcVS-k2y0qP5H6EYZw/exec";

  const form = document.getElementById("contactForm");
  const submitBtn = form?.querySelector(
    "button[type='submit']",
  );
  const resultDiv =
    document.getElementById("contactResult");

  if (!form || !submitBtn || !resultDiv) return;

  const lang = document.documentElement.lang;
  const isEn = lang === "en";

  const messages = {
    ja: {
      maintenance:
        "現在、お問い合わせフォームのメンテナンス中です。お手数ですがメール（pankun.eng@gmail.com）にてご連絡ください。",
      success:
        "お問い合わせありがとうございます。送信が完了しました。\n確認のため、自動返信メールなどは送信しておりませんのでご了承ください。",
      error:
        "送信に失敗しました。通信環境をご確認いただくか、直接メールにてお問い合わせください。",
    },
    en: {
      maintenance:
        "The contact form is currently under maintenance. Please contact us via email (pankun.eng@gmail.com).",
      success:
        "Thank you for your inquiry. Your message has been sent successfully.\nPlease note that we do not send automatic confirmation emails.",
      error:
        "Failed to send. Please check your network connection or contact us directly via email.",
    },
  };
  const msg = isEn ? messages.en : messages.ja;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. URL設定チェック
    if (!GAS_API_URL) {
      showResult("error", msg.maintenance);
      console.error("Error: GAS_API_URL is empty.");
      return;
    }

    // 2. バリデーション (HTML5標準)
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // 3. ローディング表示
    setLoading(true);

    // 4. データ収集
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      // 5. 送信
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
      }

      // レスポンス解析
      const resJson = await response.json();

      if (resJson.result === "success") {
        showResult("success", msg.success);
        form.reset();
      } else {
        throw new Error(
          resJson.error || "GAS script returned error",
        );
      }
    } catch (error) {
      console.error("Submission failed:", error);
      showResult("error", msg.error);
    } finally {
      setLoading(false);
    }
  });

  /**
   * ローディング状態の切り替え
   */
  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.classList.add("is-loading");
      submitBtn.disabled = true;
      resultDiv.style.display = "none";
    } else {
      submitBtn.classList.remove("is-loading");
      submitBtn.disabled = false;
    }
  }

  /**
   * 結果メッセージ表示
   * @param {'success'|'error'} type
   * @param {string} message
   */
  function showResult(type, message) {
    resultDiv.textContent = message;
    // 改行コードを <br> に変換しない場合、CSS white-space: pre-wrap 推奨
    // ここではテキストコンテント設定なので改行文字がそのまま入る
    resultDiv.style.whiteSpace = "pre-wrap";

    resultDiv.className = "contact-result"; // クラスリセット
    resultDiv.classList.add(type);
  }
});
