<?php
declare(strict_types=1);

function qrlav_load_config(): array {
    $candidates = [
        dirname(__DIR__) . '/config.php',
        dirname(__DIR__, 3) . '/qrlav_config.php',
    ];
    foreach ($candidates as $path) {
        if (is_file($path)) {
            $cfg = require $path;
            if (is_array($cfg)) return $cfg;
        }
    }
    throw new RuntimeException('Falta el archivo de configuración del servidor (config.php).');
}

function qrlav_pdo(array $cfg): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $host = $cfg['db_host'];
    $connect = static function (string $hostname) use ($cfg): PDO {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $hostname, $cfg['db_port'] ?? '3306', $cfg['db_name'], $cfg['db_charset'] ?? 'utf8mb4');
        return new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    };
    try {
        $pdo = $connect($host);
    } catch (PDOException $error) {
        if (strtolower($host) !== 'srv737.hstgr.io') throw $error;
        try {
            $pdo = $connect('localhost');
        } catch (PDOException $localError) {
            if ((int)($localError->errorInfo[1] ?? 0) !== 2002) throw $localError;
            $pdo = $connect('127.0.0.1');
        }
    }
    return $pdo;
}

function qrlav_is_https(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') return true;
    return false;
}

function qrlav_set_session_cookie(string $sid, int $ttlSec): void {
    setcookie('qrlav_sid', $sid, [
        'expires' => time() + $ttlSec,
        'path' => '/Qr/',
        'secure' => qrlav_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function qrlav_clear_session_cookie(): void {
    setcookie('qrlav_sid', '', [
        'expires' => time() - 3600,
        'path' => '/Qr/',
        'secure' => qrlav_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function qrlav_json(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function qrlav_read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function qrlav_uuid(string $prefix): string {
    return $prefix . '_' . bin2hex(random_bytes(16));
}

function qrlav_require_auth(PDO $pdo, array $cfg): array {
    $sid = $_COOKIE['qrlav_sid'] ?? '';
    if (!is_string($sid) || $sid === '') {
        qrlav_json(['error' => 'Sesión no iniciada o expirada.'], 401);
    }

    $stmt = $pdo->prepare(
        'SELECT s.id AS sid, s.csrf_token, s.last_activity_at, s.expires_at,
                u.id AS uid, u.username, u.role, u.status, u.is_primary_superadmin, u.created_at, u.last_login_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ?'
    );
    $stmt->execute([$sid]);
    $row = $stmt->fetch();

    if (!$row) {
        qrlav_clear_session_cookie();
        qrlav_json(['error' => 'Sesión inválida o revocada.'], 401);
    }

    $nowMs = (int)(microtime(true) * 1000);
    $idleMs = ((int)($cfg['idle_timeout_sec'] ?? 1800)) * 1000;
    if ($nowMs > (int)$row['expires_at'] || ($nowMs - (int)$row['last_activity_at']) > $idleMs) {
        $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$sid]);
        qrlav_clear_session_cookie();
        qrlav_json(['error' => 'Tu sesión caducó por inactividad.'], 401);
    }

    if ($row['status'] !== 'active') {
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$row['uid']]);
        qrlav_clear_session_cookie();
        qrlav_json(['error' => 'Tu cuenta ha sido suspendida.'], 403);
    }

    $pdo->prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?')->execute([$nowMs, $sid]);
    return $row;
}

function qrlav_require_csrf(array $sessionRow): void {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($token) || !hash_equals((string)$sessionRow['csrf_token'], $token)) {
        qrlav_json(['error' => 'Token CSRF inválido o ausente.'], 403);
    }
}

function qrlav_sanitize_svg(string $svg): string {
    $clean = preg_replace('/<\?xml[\s\S]*?\?>/i', '', $svg) ?? $svg;
    $clean = preg_replace('/<!DOCTYPE[\s\S]*?>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/<script[\s\S]*?<\/script>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/<script[^>]*\/>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/<foreignObject[\s\S]*?<\/foreignObject>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/<iframe[\s\S]*?<\/iframe>/i', '', $clean) ?? $clean;
    $clean = preg_replace('/\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $clean) ?? $clean;
    $clean = preg_replace('/(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|\'\s*javascript:[^\']*\')/i', '', $clean) ?? $clean;
    if (!preg_match('/<svg[\s>]/i', $clean)) {
        throw new RuntimeException('El archivo SVG no contiene una etiqueta <svg> válida.');
    }
    return $clean;
}

function qrlav_inspect_image(string $bytes, string $declaredMime, string $originalName): array {
    if (strlen($bytes) < 12) {
        throw new RuntimeException('Archivo vacío o dañado.');
    }
    if (substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
        $info = @getimagesizefromstring($bytes);
        $hasAlpha = false;
        if (strlen($bytes) >= 26 && substr($bytes, 12, 4) === 'IHDR') {
            $colorType = ord($bytes[25]);
            $hasAlpha = ($colorType === 4 || $colorType === 6 || strpos($bytes, 'tRNS') !== false);
        }
        return [
            'mime' => 'image/png',
            'ext' => 'png',
            'width' => $info[0] ?? null,
            'height' => $info[1] ?? null,
            'hasAlpha' => $hasAlpha,
            'bytes' => $bytes,
        ];
    }
    if (substr($bytes, 0, 3) === "\xff\xd8\xff") {
        $info = @getimagesizefromstring($bytes);
        return ['mime' => 'image/jpeg', 'ext' => 'jpg', 'width' => $info[0] ?? null, 'height' => $info[1] ?? null, 'hasAlpha' => false, 'bytes' => $bytes];
    }
    $h6 = substr($bytes, 0, 6);
    if ($h6 === 'GIF87a' || $h6 === 'GIF89a') {
        $info = @getimagesizefromstring($bytes);
        return ['mime' => 'image/gif', 'ext' => 'gif', 'width' => $info[0] ?? null, 'height' => $info[1] ?? null, 'hasAlpha' => true, 'bytes' => $bytes];
    }
    if (substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') {
        $info = @getimagesizefromstring($bytes);
        return ['mime' => 'image/webp', 'ext' => 'webp', 'width' => $info[0] ?? null, 'height' => $info[1] ?? null, 'hasAlpha' => true, 'bytes' => $bytes];
    }
    if (substr($bytes, 0, 2) === 'BM') {
        $info = @getimagesizefromstring($bytes);
        return ['mime' => 'image/bmp', 'ext' => 'bmp', 'width' => $info[0] ?? null, 'height' => $info[1] ?? null, 'hasAlpha' => false, 'bytes' => $bytes];
    }
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $head = ltrim(substr($bytes, 0, 2048));
    if ($declaredMime === 'image/svg+xml' || $ext === 'svg' || stripos($head, '<svg') === 0 || (stripos($head, '<?xml') === 0 && stripos($head, '<svg') !== false)) {
        $clean = qrlav_sanitize_svg($bytes);
        return ['mime' => 'image/svg+xml', 'ext' => 'svg', 'width' => null, 'height' => null, 'hasAlpha' => true, 'bytes' => $clean];
    }
    if (substr($bytes, 4, 4) === 'ftyp') {
        $brand = strtolower(substr($bytes, 8, 4));
        if ($brand === 'avif' || $brand === 'avis') {
            return ['mime' => 'image/avif', 'ext' => 'avif', 'width' => null, 'height' => null, 'hasAlpha' => true, 'bytes' => $bytes];
        }
        if (in_array($brand, ['heic', 'heix', 'mif1', 'msf1'], true)) {
            return ['mime' => 'image/heic', 'ext' => 'heic', 'width' => null, 'height' => null, 'hasAlpha' => true, 'bytes' => $bytes];
        }
    }
    if (substr($bytes, 0, 4) === "II*\x00" || substr($bytes, 0, 4) === "MM\x00*") {
        return ['mime' => 'image/tiff', 'ext' => 'tiff', 'width' => null, 'height' => null, 'hasAlpha' => true, 'bytes' => $bytes];
    }
    throw new RuntimeException('Formato de imagen no admitido o firma binaria inválida.');
}

function qrlav_sync_file_refs(PDO $pdo, array $cfg, string $refType, string $refId, string $designJson): void {
    $prevStmt = $pdo->prepare('SELECT file_id FROM file_references WHERE ref_type = ? AND ref_id = ?');
    $prevStmt->execute([$refType, $refId]);
    $prevIds = $prevStmt->fetchAll(PDO::FETCH_COLUMN);

    $pdo->prepare('DELETE FROM file_references WHERE ref_type = ? AND ref_id = ?')->execute([$refType, $refId]);

    $parsed = json_decode($designJson, true);
    $fileId = $parsed['logo']['fileId'] ?? null;
    $newIds = (is_string($fileId) && $fileId !== '') ? [$fileId] : [];

    foreach ($newIds as $fid) {
        $chk = $pdo->prepare('SELECT 1 FROM files WHERE id = ?');
        $chk->execute([$fid]);
        if ($chk->fetchColumn()) {
            $pdo->prepare('INSERT IGNORE INTO file_references (file_id, ref_type, ref_id) VALUES (?, ?, ?)')->execute([$fid, $refType, $refId]);
        }
    }

    foreach ($prevIds as $oldId) {
        if (!in_array($oldId, $newIds, true)) {
            qrlav_cleanup_file($pdo, $cfg, (string)$oldId);
        }
    }
}

function qrlav_cleanup_file(PDO $pdo, array $cfg, string $fileId): void {
    $c1 = $pdo->prepare('SELECT COUNT(*) FROM file_references WHERE file_id = ?');
    $c1->execute([$fileId]);
    if ((int)$c1->fetchColumn() > 0) return;

    $c2 = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE logo_file_id = ?');
    $c2->execute([$fileId]);
    $c3 = $pdo->prepare('SELECT COUNT(*) FROM templates WHERE logo_file_id = ?');
    $c3->execute([$fileId]);
    if ((int)$c2->fetchColumn() > 0 || (int)$c3->fetchColumn() > 0) return;

    $fStmt = $pdo->prepare('SELECT storage_name FROM files WHERE id = ?');
    $fStmt->execute([$fileId]);
    $storageName = $fStmt->fetchColumn();
    if ($storageName) {
        $path = rtrim($cfg['private_storage_dir'], '/') . '/' . $storageName;
        if (is_file($path)) @unlink($path);
        $pdo->prepare('DELETE FROM files WHERE id = ?')->execute([$fileId]);
    }
}
