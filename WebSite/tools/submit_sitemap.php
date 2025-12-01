<?php
/**
 * @file submit_sitemap.php
 * @description Google Search Console API にサイトマップを送信するスクリプト
 * @summary
 *   - コマンドラインからサイトマップ URL を受け取り、GSC API に送信
 *   - サービスアカウント認証を使用
 *   - sitemap index ファイルの再帰的な処理に対応
 * @recent_changes
 *   - ファイル先頭に説明コメントを追加
 *   - 冗長な echo 出力を削減（重要な情報は維持）
 */

//ドメイン
$siteUrl = "https://breadmotion.github.io/";
//認証用のファイル
$credentialFile = "./tools/service_account.json";

//サイトマップ
$sitemapOrIndexUrls = [];

//Search Console APIに制限はないけど、間隔をあける
$intervalSecondsPerAPI = 1;

require_once __DIR__ . "/../vendor/autoload.php";

//コマンドラインパラメータ
foreach ($argv as $n => $v) {
    if (
        startsWith($v, "http://") ||
        startsWith($v, "https://")
    ) {
        $sitemapOrIndexUrls[] = trim($v);
    }
}
if (empty($sitemapOrIndexUrls)) {
    echo "[ERROR] Put sitemap or sitemap index URL as commandline parameter" . PHP_EOL;
    exit();
}

//URLからサイトマップ取りに行くところ
$options = ["exceptions" => false, "debug" => false];
$http = new GuzzleHttp\Client($options);

$list = [];

do {
    $url = array_shift($sitemapOrIndexUrls);
    // 冗長なログを削減: 重要な処理のみ表示
    $tags = readSitemapXml($http, $url);

    foreach ($tags as $name => $data) {
        $loc = (string) $data->loc;
        if ($name == "sitemap") {
            $sitemapOrIndexUrls[] = $loc;
        } elseif ($name == "url") {
            $list[] = $url;
            break;
        }
    }
} while (!empty($sitemapOrIndexUrls));

echo "[INFO] Sitemap URLs to submit: " . count($list) . PHP_EOL;

//Search Console API
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
foreach ($list as $n => $sitemap) {
    $endpoint = $endpointBase . urlencode($sitemap);

    //このAPIはPUTするやつ
    $response = $httpClient->put($endpoint);
    $body = $response->getBody()->getContents();
    $json = json_decode($body, true);

    $status = $response->getStatusCode();
    $results[$status] = ($results[$status] ?? 0) + 1;

    // エラー時のみ詳細を出力
    if ($status != 204) {
        $message = $json["error"]["message"] ?? "-";
        echo "[ERROR] " . $status . ":" . $response->getReasonPhrase() . " | " . $message . PHP_EOL;
    }

    sleep($intervalSecondsPerAPI);
}

// 結果サマリを出力
echo "[SUCCESS] Submission complete. Results:" . PHP_EOL;
foreach ($results as $status => $count) {
    echo "  Status " . $status . ": " . $count . " sitemaps" . PHP_EOL;
}

function readSitemapXml($http, $url)
{
    $response = $http->request("GET", $url);
    $body = $response->getBody()->getContents();
    $xml = new SimpleXMLElement($body);
    return $xml;
}

//Google APIのタイムスタンプがnano秒まであるので正規表現で削り取る
function toJST($datetime)
{
    $p =
        "/(\d{4})-(\d{2})-(\d{2})T(\d{2})\:(\d{2})\:(\d{2})\.[0-9]{9}Z/";
    if (preg_match($p, $datetime, $_)) {
        $datetime = "$_[1]-$_[2]-$_[3]T$_[4]:$_[5]:$_[6]Z";
    }
    $t = new DateTime($datetime);
    $t->setTimeZone(new DateTimeZone("Asia/Tokyo"));
    return $t->format("Y-m-d H:i:s");
}

function startsWith($haystack, $needle)
{
    $length = strlen($needle);
    return substr($haystack, 0, $length) === $needle;
}
