/**
 * @file fetch-gsc-data.js
 * @description Google Search Console API から人気記事データを取得し、popular.json を生成するスクリプト
 * @summary
 *   - サービスアカウント認証を使用して GSC API にアクセス
 *   - 指定期間内のクリック数上位のブログ記事 ID を抽出
 *   - assets/data/popular.json として出力
 * @recent_changes
 *   - 簡易ロガー関数を追加（本番環境では verbose ログを抑制）
 *   - 冗長なコンソール出力を削減
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ───────────────────────────────────────────────────────────────
// 簡易ロガー: NODE_ENV !== 'production' の場合のみ verbose 出力
// ───────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";
const logger = {
  info: (msg) => !isProduction && console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
};

// ==========================================
// 設定
// ==========================================

// Google Search Console に登録しているプロパティURL
// ドメインプロパティの場合は 'sc-domain:breadmotion.github.io' のように記述
// URLプレフィックスの場合は 'https://breadmotion.github.io/' のように記述
const SITE_URL = 'https://breadmotion.github.io/';

// サービスアカウントキーのパス
// 環境変数 GSC_KEY_FILE または tools/service-account.json を参照
const KEY_FILE_PATH = process.env.GSC_KEY_FILE || path.join(__dirname, 'service-account.json');

// 出力先ファイルパス
const OUTPUT_FILE = path.join(__dirname, '../assets/data/popular.json');

// 取得する期間（過去何日分か）
const DAYS_AGO = 60;

// URLから記事IDを抽出する正規表現
// 例: https://.../blog/blog_00001.html -> blog_00001
const BLOG_ID_REGEX = /\/blog\/(blog_\d+)\.html/;

// ==========================================
// メイン処理
// ==========================================

async function main() {
    logger.info('Fetching Google Search Console Data...');

    // キーファイルの存在確認
    if (!fs.existsSync(KEY_FILE_PATH)) {
        logger.warn(`Service account key file not found at: ${KEY_FILE_PATH}`);
        logger.warn('Skipping GSC fetch. If you want to use popular posts, please set GSC_KEY_FILE env var or place service-account.json.');
        // キーがない場合は空配列を書き出して正常終了（ビルドを止めないため）
        saveJson([]);
        return;
    }

    try {
        // 認証クライアントの作成
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });

        const searchconsole = google.searchconsole({
            version: 'v1',
            auth,
        });

        // 日付範囲の計算
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - DAYS_AGO);

        const formatDate = (date) => date.toISOString().split('T')[0];

        logger.info(`Querying GSC for site: ${SITE_URL}`);
        logger.info(`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`);

        // データ取得
        const res = await searchconsole.searchanalytics.query({
            siteUrl: SITE_URL,
            requestBody: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                dimensions: ['page'],
                rowLimit: 50, // 上位50件を取得してフィルタリング
            },
        });

        const rows = res.data.rows || [];
        logger.info(`Fetched ${rows.length} rows.`);

        // ブログ記事IDの抽出と集計
        // GSCはクリック数順に返してくれるが、念のためソート
        rows.sort((a, b) => b.clicks - a.clicks);

        const popularIds = [];
        const seenIds = new Set();

        for (const row of rows) {
            const url = row.keys[0]; // dimensions: ['page'] なので keys[0] は URL
            const match = url.match(BLOG_ID_REGEX);

            if (match) {
                const id = match[1];
                if (!seenIds.has(id)) {
                    popularIds.push(id);
                    seenIds.add(id);
                }
            }

            // 上位10件程度あれば十分
            if (popularIds.length >= 10) break;
        }

        logger.info(`Popular Post IDs: ${popularIds.join(', ')}`);
        saveJson(popularIds);

    } catch (error) {
        logger.error(`Failed to fetch GSC data: ${error.message}`);
        // APIエラー時などはビルドを失敗させる
        process.exit(1);
    }
}

function saveJson(data) {
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
    logger.success(`Saved popular data to: ${OUTPUT_FILE}`);
}

main();
