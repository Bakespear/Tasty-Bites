<?php
require 'vendor/autoload.php'; // For MongoDB PHP library
use MongoDB\Client;

// Load environment variables (use a library like vlucas/phpdotenv if needed)
$dotenv = parse_ini_file('.env');
$MONGO_URI = $dotenv['MONGO_URI'] ?? 'mongodb://localhost:27017';
$MONGO_DB = $dotenv['MONGO_DB'] ?? 'tasty_bites';
$PORT = $dotenv['PORT'] ?? 3000;
$ADMIN_KEY = $dotenv['ADMIN_KEY'] ?? null;
// Add other env vars as needed

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Key');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Admin-Key');
    http_response_code(200);
    exit;
}

// MongoDB connection
$mongoClient = new Client($MONGO_URI);
$db = $mongoClient->$MONGO_DB;
$paymentsCollection = $db->payments;
$ordersCollection = $db->orders;

// File paths for fallback
$DATA_DIR = __DIR__ . '/data';
$PAYMENTS_FILE = $DATA_DIR . '/payments.json';
$ORDERS_FILE = $DATA_DIR . '/orders.json';

// Helper to send JSON response
function sendJson($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Admin-Key');
    echo json_encode($data);
    exit;
}

// Routes (simple router)
$requestUri = $_SERVER['REQUEST_URI'];
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Serve static files from parent directory
if ($requestMethod === 'GET' && file_exists(__DIR__ . '/../' . $requestUri)) {
    $file = __DIR__ . '/../' . $requestUri;
    $mime = mime_content_type($file);
    header('Content-Type: ' . $mime);
    header('Access-Control-Allow-Origin: *');
    readfile($file);
    exit;
}

if ($requestMethod === 'GET' && $requestUri === '/health') {
    sendJson(['ok' => true]);
} elseif ($requestMethod === 'POST' && $requestUri === '/api/mpesa/stk-push') {
    // Handle STK push (similar logic, using curl for HTTP requests)
    $body = json_decode(file_get_contents('php://input'), true);
    $phone = $body['phone'] ?? null;
    $amount = $body['amount'] ?? null;

    if (!$phone || !$amount) {
        sendJson(['error' => 'phone and amount are required'], 400);
    }

    // Simulate or real STK push (adapt Node.js logic to PHP/curl)
    // ... (implement token fetch, STK request using curl)
    sendJson(['simulated' => true, 'message' => 'STK push simulated']);
} elseif ($requestMethod === 'POST' && $requestUri === '/api/mpesa/callback') {
    // Handle callback
    $payload = json_decode(file_get_contents('php://input'), true);
    $record = ['receivedAt' => date('c'), 'payload' => $payload];

    // Extract STK details if present
    if (isset($payload['Body']['stkCallback'])) {
        $stk = $payload['Body']['stkCallback'];
        $record = [
            'receivedAt' => date('c'),
            'type' => 'stkCallback',
            'MerchantRequestID' => $stk['MerchantRequestID'] ?? null,
            'CheckoutRequestID' => $stk['CheckoutRequestID'] ?? null,
            'ResultCode' => $stk['ResultCode'] ?? null,
            'ResultDesc' => $stk['ResultDesc'] ?? null,
            'metadata' => [],
            'raw' => $stk
        ];
        if (isset($stk['CallbackMetadata']['Item'])) {
            foreach ($stk['CallbackMetadata']['Item'] as $item) {
                $record['metadata'][$item['Name']] = $item['Value'];
            }
        }
    }

    try {
        $paymentsCollection->insertOne($record);
        sendJson(['status' => 'received', 'stored' => 'mongodb']);
    } catch (Exception $e) {
        // Fallback to file
        if (!is_dir($DATA_DIR)) mkdir($DATA_DIR, 0777, true);
        $existing = file_exists($PAYMENTS_FILE) ? json_decode(file_get_contents($PAYMENTS_FILE), true) : [];
        $existing[] = $record;
        file_put_contents($PAYMENTS_FILE, json_encode($existing, JSON_PRETTY_PRINT));
        sendJson(['status' => 'received', 'stored' => 'file']);
    }
} elseif ($requestMethod === 'POST' && $requestUri === '/api/orders') {
    // Handle orders
    $body = json_decode(file_get_contents('php://input'), true);
    $items = $body['items'] ?? null;
    $customerPhone = $body['customerPhone'] ?? null;
    $totalAmount = $body['totalAmount'] ?? null;
    $paymentMethod = $body['paymentMethod'] ?? 'mpesa';

    if (!$items || !is_array($items) || empty($items)) {
        sendJson(['error' => 'items array is required'], 400);
    }
    if (!$customerPhone || !$totalAmount) {
        sendJson(['error' => 'customerPhone and totalAmount are required'], 400);
    }

    $order = [
        'orderId' => 'TB-' . time(),
        'items' => $items,
        'customerPhone' => $customerPhone,
        'totalAmount' => $totalAmount,
        'paymentMethod' => $paymentMethod,
        'status' => 'pending',
        'createdAt' => date('c'),
        'updatedAt' => date('c')
    ];

    try {
        $ordersCollection->insertOne($order);
        sendJson(['success' => true, 'orderId' => $order['orderId'], 'stored' => 'mongodb']);
    } catch (Exception $e) {
        // Fallback to file
        if (!is_dir($DATA_DIR)) mkdir($DATA_DIR, 0777, true);
        $existing = file_exists($ORDERS_FILE) ? json_decode(file_get_contents($ORDERS_FILE), true) : [];
        $existing[] = $order;
        file_put_contents($ORDERS_FILE, json_encode($existing, JSON_PRETTY_PRINT));
        sendJson(['success' => true, 'orderId' => $order['orderId'], 'stored' => 'file']);
    }
} elseif ($requestMethod === 'GET' && $requestUri === '/api/admin/orders') {
    // Admin orders
    $adminKey = $_SERVER['HTTP_X_ADMIN_KEY'] ?? null;
    if (!$ADMIN_KEY || $adminKey !== $ADMIN_KEY) {
        sendJson(['error' => 'unauthorized'], 401);
    }

    try {
        $docs = $ordersCollection->find([], ['sort' => ['createdAt' => -1], 'limit' => 1000])->toArray();
        sendJson(['source' => 'mongodb', 'count' => count($docs), 'orders' => $docs]);
    } catch (Exception $e) {
        $existing = file_exists($ORDERS_FILE) ? json_decode(file_get_contents($ORDERS_FILE), true) : [];
        sendJson(['source' => 'file', 'count' => count($existing), 'orders' => array_reverse($existing)]);
    }
} elseif ($requestMethod === 'GET' && $requestUri === '/api/admin/payments') {
    // Admin payments
    $adminKey = $_SERVER['HTTP_X_ADMIN_KEY'] ?? null;
    if (!$ADMIN_KEY || $adminKey !== $ADMIN_KEY) {
        sendJson(['error' => 'unauthorized'], 401);
    }

    try {
        $docs = $paymentsCollection->find([], ['sort' => ['receivedAt' => -1], 'limit' => 1000])->toArray();
        sendJson(['source' => 'mongodb', 'count' => count($docs), 'payments' => $docs]);
    } catch (Exception $e) {
        $existing = file_exists($PAYMENTS_FILE) ? json_decode(file_get_contents($PAYMENTS_FILE), true) : [];
        sendJson(['source' => 'file', 'count' => count($existing), 'payments' => array_reverse($existing)]);
    }
} else {
    sendJson(['error' => 'Not found'], 404);
}
?>