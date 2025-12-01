<?php
/**
 * @file submit_sitemap.php
 * @description Google Search Console API にサイトマップを送信するスクリプト（改良版）
 *   - sitemapindex / urlset を明確に判別して送信対象を収集
 *   - 簡易なデバッグ（VERBOSE 環境変数で詳細ログ）
 */

$siteUrl = "https://breadmotion.github.io/"; // Search Console に登録しているサイトの URL（末尾の / を含めて正確に）
$credentialFile = "./tools/service_account.json";

require_once __DIR__ . "/../vendor/autoload.php";

$verbose = getenv("VERBOSE") === "1";

// コマンドラインで渡された sitemap(s)
$sitemapOrIndexUrls = [];
foreach ($argv as $v) {
    if (
        strpos($v, "http://") === 0 ||
        strpos($v, "https://") === 0
    ) {
        $sitemapOrIndexUrls[] = trim($v);
    }
}
if (empty($sitemapOrIndexUrls)) {
    echo "[ERROR] Put sitemap or sitemap index URL as commandline parameter" .
        PHP_EOL;
    exit(1);
}

$options = ["exceptions" => false, "debug" => false];
$http = new GuzzleHttp\Client($options);

$toSubmit = []; // 実際に Search Console に PUT する sitemap URL の一覧

// 再帰的に sitemapindex を展開して、最終的に「sitemap ファイルの URL」を toSubmit に集める
while (!empty($sitemapOrIndexUrls)) {
    $url = array_shift($sitemapOrIndexUrls);
    if ($verbose) {
        echo "[INFO] Fetching sitemap: {$url}" . PHP_EOL;
    }

    try {
        $response = $http->request("GET", $url);
        $body = $response->getBody()->getContents();
    } catch (Exception $e) {
        echo "[ERROR] Failed to GET {$url}: " .
            $e->getMessage() .
            PHP_EOL;
        continue;
    }

    libxml_use_internal_errors(true);
    try {
        $xml = new SimpleXMLElement($body);
    } catch (Exception $e) {
        echo "[ERROR] Invalid XML from {$url}: " .
            $e->getMessage() .
            PHP_EOL;
        if ($verbose) {
            echo $body . PHP_EOL;
        }
        continue;
    }

    $rootName = $xml->getName();
    if ($rootName === "sitemapindex") {
        // 子 sitemap を追加して再処理
        foreach ($xml->sitemap as $sitemap) {
            $loc = trim((string) $sitemap->loc);
            if ($loc !== "") {
                $sitemapOrIndexUrls[] = $loc;
                if ($verbose) {
                    echo "[INFO] Found child sitemap: {$loc}" .
                        PHP_EOL;
                }
            }
        }
    } elseif ($rootName === "urlset") {
        // このファイル自体が sitemap（URL を並べるタイプ）なので、この sitemap URL を送信対象に追加
        $toSubmit[] = $url;
        if ($verbose) {
            echo "[INFO] Added urlset for submission: {$url}" .
                PHP_EOL;
        }
    } else {
        if ($verbose) {
            echo "[WARN] Unknown root element '{$rootName}' in {$url}" .
                PHP_EOL;
        }
    }
}

if (empty($toSubmit)) {
    echo "[ERROR] No sitemap files detected to submit." .
        PHP_EOL;
    exit(1);
}

echo "[INFO] Sitemap URLs to submit: " .
    count($toSubmit) .
    PHP_EOL;

// Google Client 設定
$client = new Google_Client();
$client->setAuthConfig($credentialFile);
$client->addScope(
    "https://www.googleapis.com/auth/webmasters",
);
$httpClient = $client->authorize();

$endpointBase =
    "https://www.googleapis.com/webmasters/v3/sites/" .
    urlencode($siteUrl) .
    "/sitemaps/";

$results = [];
foreach ($toSubmit as $sitemap) {
    $endpoint = $endpointBase . urlencode($sitemap);
    if ($verbose) {
        echo "[INFO] PUT {$endpoint}" . PHP_EOL;
    }

    try {
        $response = $httpClient->put($endpoint);
        $status = $response->getStatusCode();
        $body = $response->getBody()->getContents();
        $results[$status] = ($results[$status] ?? 0) + 1;

        if ($status != 204) {
            $json = json_decode($body, true);
            $message =
                $json["error"]["message"] ??
                $response->getReasonPhrase();
            echo "[ERROR] {$status}: {$message}" . PHP_EOL;
            if ($verbose) {
                echo $body . PHP_EOL;
            }
        } else {
            if ($verbose) {
                echo "[INFO] 204 OK for {$sitemap}" .
                    PHP_EOL;
            }
        }
    } catch (Exception $e) {
        echo "[ERROR] Exception while submitting {$sitemap}: " .
            $e->getMessage() .
            PHP_EOL;
    }

    // API レート対策（短くスリープ）
    sleep(1);
}

// 結果表示
echo "[SUCCESS] Submission complete. Results:" . PHP_EOL;
foreach ($results as $status => $count) {
    echo "  Status " .
        $status .
        ": " .
        $count .
        " sitemaps" .
        PHP_EOL;
}
