<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$dataDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'App_Data';
$dataFile = $dataDirectory . DIRECTORY_SEPARATOR . 'data.json';

if (!is_dir($dataDirectory)) {
    mkdir($dataDirectory, 0755, true);
}

if (!file_exists($dataFile)) {
    $fallbackFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data.json';
    if (file_exists($fallbackFile)) {
        copy($fallbackFile, $dataFile);
    } else {
        file_put_contents($dataFile, json_encode([
            'settings' => ['schoolName' => 'مدرستي', 'logo' => ''],
            'labs' => [
                ['id' => 'lab-bio', 'name' => 'مختبر أحياء'],
                ['id' => 'lab-geo', 'name' => 'مختبر جيولوجيا'],
            ],
            'users' => [
                ['id' => 'user-admin', 'name' => 'مدير النظام', 'username' => 'admin', 'password' => 'admin123', 'role' => 'admin'],
            ],
            'cabinets' => [],
            'items' => [],
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    readfile($dataFile);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawBody = file_get_contents('php://input');
    $decoded = json_decode($rawBody, true);

    if (!is_array($decoded)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit;
    }

    $json = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Cannot encode JSON']);
        exit;
    }

    $tempFile = $dataFile . '.tmp';
    if (file_put_contents($tempFile, $json . PHP_EOL, LOCK_EX) === false || !rename($tempFile, $dataFile)) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot write data file']);
        exit;
    }

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
