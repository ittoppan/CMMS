<?php
/**
 * src/services/WebPushService.php — Web Push (RFC 8291 + RFC 8188) ไม่ต้องใช้ library ภายนอก
 *
 * - VAPID keys เก็บในตาราง settings (vapid_public_key, vapid_private_key) — สร้างอัตโนมัติครั้งแรก
 * - P-256 (secp256r1) keygen + ECDH: ใช้ pure-PHP + bcmath (ผ่านการ cross-validate กับ OpenSSL แล้ว)
 *   เพราะ PHP/OpenSSL build บางตัว (เช่น Windows) openssl_pkey_new / openssl_pkey_derive ใช้งานไม่ได้
 * - VAPID JWT (ES256) + AES-128-GCM: ใช้ openssl (ผ่านการทดสอบแล้ว)
 *
 * ใช้:
 *   require_once __DIR__ . '/../services/WebPushService.php';
 *   WebPushService::sendToUsers($pdo, $userId, 'หัวข้อ', 'เนื้อหา', '/pages/...');
 */

class WebPushService
{
    // ---- secp256r1 / P-256 constants ----
    private const P256_P  = 'ffffffff00000001000000000000000000000000ffffffffffffffffffffffff';
    private const P256_A  = 'ffffffff00000001000000000000000000000000fffffffffffffffffffffffc';
    private const P256_GX = '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296';
    private const P256_GY = '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

    public static function base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64url_decode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }

    // ---------- pure-PHP EC (bcmath) ----------

    private static function hex2dec(string $hex): string
    {
        $dec = '0';
        foreach (str_split(strtolower($hex)) as $c) { $dec = bcadd(bcmul($dec, '16'), (string)hexdec($c)); }
        return $dec;
    }

    private static function dec2hex(string $dec, int $pad = 0): string
    {
        $hex = '';
        while (bccomp($dec, '0') > 0) { $hex = dechex((int)bcmod($dec, '16')) . $hex; $dec = bcdiv($dec, '16', 0); }
        return $hex === '' ? str_pad('0', $pad, '0', STR_PAD_LEFT) : str_pad($hex, $pad, '0', STR_PAD_LEFT);
    }

    private static function ecMod(string $a, string $p): string
    {
        return bcmod(bcadd(bcmod($a, $p), $p), $p);
    }

    private static function ecDouble(string $x, string $y, string $p, string $a): array
    {
        $num = bcadd(bcmul('3', bcpow($x, '2')), $a);
        $l   = bcmod(bcmul($num, bcpowmod(bcmul('2', $y), bcsub($p, '2'), $p)), $p);
        $x3  = self::ecMod(bcsub(bcpow($l, '2'), bcmul('2', $x)), $p);
        $y3  = self::ecMod(bcsub(bcmul($l, bcsub($x, $x3)), $y), $p);
        return [$x3, $y3];
    }

    private static function ecAdd(string $x1, string $y1, string $x2, string $y2, string $p): array
    {
        if ($x1 === '0' && $y1 === '0') { return [$x2, $y2]; }
        if ($x2 === '0' && $y2 === '0') { return [$x1, $y1]; }
        $l  = bcmod(bcmul(bcsub($y2, $y1), bcpowmod(bcsub($x2, $x1), bcsub($p, '2'), $p)), $p);
        $x3 = self::ecMod(bcsub(bcsub(bcpow($l, '2'), $x1), $x2), $p);
        $y3 = self::ecMod(bcsub(bcmul($l, bcsub($x1, $x3)), $y1), $p);
        return [$x3, $y3];
    }

    /** k*P บน P-256 (double-and-add MSB-first) — cross-validate กับ OpenSSL แล้ว */
    private static function ecMul(string $kHex, string $px, string $py, string $p, string $a): array
    {
        $bin = implode('', array_map(
            fn($b) => str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT),
            str_split(hex2bin($kHex))
        ));
        $rx = '0'; $ry = '0';
        foreach (str_split($bin) as $bit) {
            if ($rx !== '0' || $ry !== '0') { [$rx, $ry] = self::ecDouble($rx, $ry, $p, $a); }
            if ($bit === '1') {
                [$rx, $ry] = ($rx === '0' && $ry === '0') ? [$px, $py] : self::ecAdd($rx, $ry, $px, $py, $p);
            }
        }
        return [$rx, $ry];
    }

    /** ECDH shared secret: d(private) * peerPoint */
    private static function ecdhPure(string $dHex, string $peerPoint): string
    {
        $p  = self::hex2dec(self::P256_P);
        $a  = self::hex2dec(self::P256_A);
        $bx = self::hex2dec(substr($peerPoint, 1, 32));
        $by = self::hex2dec(substr($peerPoint, 33, 32));
        [$sx, $sy] = self::ecMul($dHex, $bx, $by, $p, $a);
        return hex2bin(self::dec2hex($sx, 64));
    }

    /** สร้างคีย์ VAPID: สุ่ม scalar d → public = d*G */
    private static function generateKeysPure(): array
    {
        $d = bin2hex(random_bytes(32));
        $p = self::hex2dec(self::P256_P);
        $a = self::hex2dec(self::P256_A);
        $gx = self::hex2dec(self::P256_GX);
        $gy = self::hex2dec(self::P256_GY);
        [$x, $y] = self::ecMul($d, $gx, $gy, $p, $a);
        $point = chr(4) . hex2bin(self::dec2hex($x, 64)) . hex2bin(self::dec2hex($y, 64));
        return ['private_pem' => self::sec1Pem($d, $point), 'public_raw' => $point];
    }

    /** สร้าง SEC1 "EC PRIVATE KEY" PEM จาก scalar + public point */
    private static function sec1Pem(string $dHex, string $point): string
    {
        $d = str_pad(hex2bin($dHex), 32, "\0", STR_PAD_LEFT);
        $oid   = "\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07";
        $a0    = "\xa0\x0a" . $oid;
        $a1    = "\xa1\x44\x03\x42\x00" . $point; // BIT STRING (66 bytes) = 03 42 00 + 65-byte point
        $inner = "\x02\x01\x01" . "\x04\x20" . $d . $a0 . $a1;
        $der   = "\x30" . chr(strlen($inner)) . $inner;
        return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----";
    }

    // ---------- keys management ----------

    public static function generateKeys(): array
    {
        // bcmath เป็นทางหลัก (พิสูจน์แล้วว่าทำงานบนเครื่องนี้) — ถ้าไม่มี ค่อยใช้ openssl
        if (function_exists('bcadd')) {
            try { return self::generateKeysPure(); } catch (Throwable $e) {}
        }
        $res = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        openssl_pkey_export($res, $privPem);
        $details = openssl_pkey_get_details($res);
        return ['private_pem' => $privPem, 'public_raw' => $details['key']];
    }

    /** โหลด (หรือสร้าง) VAPID keys จากตาราง settings */
    public static function loadKeys(PDO $pdo): array
    {
        try {
            $pub  = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'vapid_public_key'")->fetchColumn();
            $priv = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'vapid_private_key'")->fetchColumn();
        } catch (Throwable $e) { $pub = null; $priv = null; }
        if ($pub && $priv) {
            return ['public_raw' => self::base64url_decode((string)$pub), 'private_pem' => base64_decode((string)$priv)];
        }
        $k = self::generateKeys();
        $stmt = $pdo->prepare("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)");
        $stmt->execute(['vapid_public_key',  self::base64url_encode($k['public_raw'])]);
        $stmt->execute(['vapid_private_key', base64_encode($k['private_pem'])]);
        return $k;
    }

    /** แปลง 65-byte uncompressed point → SPKI PEM (prime256v1) */
    public static function pointToPem(string $point): string
    {
        if (strlen($point) !== 65) { throw new RuntimeException('invalid EC point length: ' . strlen($point)); }
        $der = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $point;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----";
    }

    /** ECDH shared secret ระหว่าง private key เรา กับ public key ของ subscription */
    public static function ecdhShare(string $privPem, string $peerPoint): string
    {
        if (function_exists('bcadd')) {
            // extract scalar d จาก SEC1 PEM
            $der = base64_decode(str_replace(["-----BEGIN EC PRIVATE KEY-----", "-----END EC PRIVATE KEY-----", "\n", "\r"], '', $privPem));
            $p = strpos($der, "\x04\x20");
            if ($p !== false) {
                $d = substr($der, $p + 2, 32);
                try { return self::ecdhPure(bin2hex($d), $peerPoint); } catch (Throwable $e) {}
            }
        }
        $peer = openssl_pkey_get_public(self::pointToPem($peerPoint));
        $own  = openssl_pkey_get_private($privPem);
        $secret = openssl_pkey_derive($peer, $own);
        if ($secret === false) { throw new RuntimeException('ECDH failed: ' . (openssl_error_string() ?: 'unknown')); }
        return $secret;
    }

    /** HKDF (RFC 5869) */
    public static function hkdf(string $salt, string $ikm, string $info, int $len): string
    {
        $prk = hash_hmac('sha256', $ikm, $salt !== '' ? $salt : str_repeat("\0", 32), true);
        $out = ''; $prev = '';
        for ($i = 1; strlen($out) < $len; $i++) {
            $prev = hash_hmac('sha256', $prev . $info . chr($i), $prk, true);
            $out .= $prev;
        }
        return substr($out, 0, $len);
    }

    /** VAPID JWT (ES256) — แปลงลายเซ็น DER → raw r||s */
    public static function vapidJwt(string $privPem, array $claims): string
    {
        $h = self::base64url_encode((string)json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $p = self::base64url_encode((string)json_encode($claims));
        $input = $h . '.' . $p;
        $ok = openssl_sign($input, $der, openssl_pkey_get_private($privPem), OPENSSL_ALGO_SHA256);
        if (!$ok) { throw new RuntimeException('ES256 sign failed'); }
        // DER: 30 <len> 02 <rlen> <r> 02 <slen> <s> — rlen อยู่ที่ offset 3 (r/s อาจมี leading zero)
        $pos  = 2;
        $rlen = ord($der[$pos + 1]);
        $r = substr($der, $pos + 2, $rlen);
        $pos += 2 + $rlen;
        $slen = ord($der[$pos + 1]);
        $s = substr($der, $pos + 2, $slen);
        $r = str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
        return $input . '.' . self::base64url_encode($r . $s);
    }

    /** เข้ารหัส payload แบบ aes128gcm (RFC 8188 + RFC 8291) */
    public static function encryptPayload(string $payload, array $sub, string $asPublic, string $asPrivate): string
    {
        $uaPublic = self::base64url_decode((string)$sub['p256dh']);
        $auth     = self::base64url_decode((string)$sub['auth']);
        $salt     = random_bytes(16);
        $shared   = self::ecdhShare($asPrivate, $uaPublic);

        $info = "WebPush: info\x00" . $uaPublic . $asPublic;
        $ikm  = self::hkdf($salt, $shared, $info, 32);
        $cek  = self::hkdf($auth, $ikm, "Content-Encoding: aes128gcm\x00", 16);
        $nonce = self::hkdf($auth, $ikm, "Content-Encoding: nonce\x00", 12);

        $header    = $salt . pack('N', 4096) . chr(65) . $uaPublic;
        $plaintext = "\x02\x00" . $payload;
        $cipher = openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, $header, 16);
        if ($cipher === false) { throw new RuntimeException('AES-128-GCM encrypt failed'); }
        return $header . $cipher . $tag;
    }

    /** ส่ง push ไปยัง subscription เดียว (true = สำเร็จ) */
    public static function sendPush(PDO $pdo, array $sub, string $title, string $body, string $url = ''): bool
    {
        $keys = self::loadKeys($pdo);
        $payload = (string)json_encode(['title' => $title, 'body' => $body, 'url' => $url], JSON_UNESCAPED_UNICODE);
        $cipher = self::encryptPayload($payload, $sub, $keys['public_raw'], $keys['private_pem']);

        $host = (string)parse_url($sub['endpoint'], PHP_URL_HOST);
        $jwt = self::vapidJwt($keys['private_pem'], [
            'aud' => (string)parse_url($sub['endpoint'], PHP_URL_SCHEME) . '://' . $host,
            'exp' => time() + 12 * 3600,
            'sub' => 'mailto:admin@localhost',
        ]);

        $ctx = stream_context_create(['http' => [
            'method'        => 'POST',
            'header'        => "Authorization: vapid t={$jwt}, k=" . self::base64url_encode($keys['public_raw']) . "\r\n"
                             . "Content-Encoding: aes128gcm\r\n"
                             . "Content-Type: application/octet-stream\r\n"
                             . "TTL: 86400\r\n"
                             . "Urgency: high\r\n"
                             . "Content-Length: " . strlen($cipher) . "\r\n",
            'content'       => $cipher,
            'timeout'       => 10,
            'ignore_errors' => true,
        ]]);
        @file_get_contents($sub['endpoint'], false, $ctx);
        $status = 0;
        if (isset($http_response_header)) {
            foreach ($http_response_header as $h) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) { $status = (int)$m[1]; break; }
            }
        }
        // Subscription หมดอายุ/ถูกลบ — ลบทิ้ง
        if ($status === 404 || $status === 410) {
            try {
                $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$sub['endpoint']]);
            } catch (Throwable $e) {}
            return false;
        }
        return $status >= 200 && $status < 300;
    }

    /**
     * ส่ง push ไปทุก subscription ของ user (userId = null → ทุกคนที่ subscribe)
     * คืนจำนวนที่ส่งสำเร็จ
     */
    public static function sendToUsers(PDO $pdo, ?int $userId, string $title, string $body, string $url = ''): int
    {
        try {
            $sql = 'SELECT endpoint, keys_p256dh, keys_auth FROM push_subscriptions';
            $params = [];
            if ($userId !== null) { $sql .= ' WHERE user_id = ?'; $params[] = $userId; }
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $sent = 0;
            foreach ($stmt->fetchAll() as $s) {
                try {
                    if (self::sendPush($pdo, ['endpoint' => $s['endpoint'], 'p256dh' => $s['keys_p256dh'], 'auth' => $s['keys_auth']], $title, $body, $url)) { $sent++; }
                } catch (Throwable $e) {}
            }
            return $sent;
        } catch (Throwable $e) {
            return 0;
        }
    }
}
