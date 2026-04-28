<?php
/**
 * Server-side proxy + cache voor Google Places API.
 * Roept Google maximaal 1x per uur aan, ongeacht hoeveel bezoekers de site heeft.
 *
 * Output: JSON met regularOpeningHours + currentOpeningHours (incl. specialDays).
 */

header('Content-Type: application/json; charset=utf-8');
// Browser/CDN cache: 5 min (verse data zonder server te bombarderen)
header('Cache-Control: public, max-age=300');

$apiKey  = 'AIzaSyC57Y_82MVoM5Gaot3Fh-7LKEBoOjsxwVk';
$placeId = 'ChIJQ1tkAldnw0cRB18bskddtjk';

$cacheFile = __DIR__ . '/.hours-cache.json';
$cacheTtl  = 3600; // 1 uur

// 1. Verse cache → meteen serveren
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    readfile($cacheFile);
    exit;
}

// 2. Cache verlopen of nog niet bestaand → Google bevragen
$url = 'https://places.googleapis.com/v1/places/' . urlencode($placeId);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => [
        'X-Goog-Api-Key: ' . $apiKey,
        'X-Goog-FieldMask: regularOpeningHours,currentOpeningHours',
    ],
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

// 3. Succes → schrijf cache + serveer
if ($httpCode === 200 && $response) {
    file_put_contents($cacheFile, $response, LOCK_EX);
    echo $response;
    exit;
}

// 4. Faal → val terug op stale cache als die er is
if (file_exists($cacheFile)) {
    readfile($cacheFile);
    exit;
}

// 5. Geen cache + Google faalt → lege response (JS gebruikt fallback)
http_response_code(503);
echo json_encode([
    'error' => 'Places API unavailable',
    'detail' => $curlErr ?: ('HTTP ' . $httpCode),
]);
