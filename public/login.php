<?php
// Cookie hardening ก่อน start session
@session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/csrf.php';

if (!empty($_SESSION['user_id'])) {
    header('Location: /');
    exit;
}

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) loadEnv($envPath);

$error = $_GET['error'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ป้องกัน login CSRF (session fixation / forced login)
    enforceCsrf();

    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($username && $password) {
        try {
            $pdo = getDb();
            $stmt = $pdo->prepare('SELECT id, password, full_name, role_id FROM users WHERE username = ? AND is_active = 1');
            $stmt->execute([$username]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password'])) {
                // ป้องกัน session fixation: สร้าง session id ใหม่ทุกครั้งที่ login สำเร็จ
                session_regenerate_id(true);
                $_SESSION['user_id']   = (int)$user['id'];
                $_SESSION['user_name'] = $user['full_name'];
                $_SESSION['role_id']   = (int)$user['role_id'];
                header('Location: /');
                exit;
            }
            $error = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
        } catch (Exception $e) {
            $error = 'ระบบขัดข้อง: ' . $e->getMessage();
        }
    } else {
        $error = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    }
}
?><!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>เข้าสู่ระบบ — CMMS-TOPPAN Enterprise</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='4' fill='%23024ad8'/><text y='22' x='6' font-size='18' fill='white' font-weight='800'>C</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/app.css?v=7.0">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
                .catch(function (err) { console.warn('[PWA] SW registration failed:', err); });
        }
    </script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        .login-split-grid {
            container-type: inline-size;
            container-name: login-split;
            padding: var(--spacing-8, 2rem);
        }
        .login-split-image {
            width: 100%;
            order: 0;
        }
        @container login-split (max-width: 511px) {
            .login-split-grid {
                padding: var(--spacing-4, 1rem);
            }
            .login-split-image {
                order: -1;
            }
        }
    </style>
</head>
<body class="bg-body text-primary font-sans antialiased" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:var(--spacing-6,1.5rem)">

<div style="width:100%;max-width:1000px;margin-inline:auto">
    <div class="bg-surface overflow-hidden" style="border-radius:var(--radius-lg,0.5rem);border:1px solid var(--color-border, #e2e8f0)">
        <div class="login-split-grid" style="display:flex;flex-wrap:wrap;gap:2rem;align-items:stretch">

            <!-- Left — Branding Panel (hidden < 512px via container query) -->
            <div class="login-split-image" style="flex:1 1 240px;min-width:240px;background-color:#0a1317;color:#fff;padding:var(--spacing-8,2rem);display:flex;flex-direction:column;justify-content:space-between;border-radius:inherit">
                <div>
                    <div style="width:48px;height:48px;background-color:var(--color-accent,#024ad8);border-radius:6px;display:flex;align-items:center;justify-content:center;margin-bottom:var(--spacing-6,1.5rem)">
                        <i data-lucide="cpu" class="w-6 h-6" style="color:#fff"></i>
                    </div>
                    <h1 style="font-size:1.75rem;font-weight:600;line-height:1.25;letter-spacing:-0.025em;margin:0 0 0.5rem;color:#fff">CMMS-TOPPAN</h1>
                    <p style="color:#94a3b8;font-size:0.875rem;line-height:1.625;margin:0 0 1.5rem">ระบบบริหารจัดการซ่อมบำรุงรักษา<br>TOPPAN Flexible Packaging (Thailand) Co., Ltd.</p>
                </div>

                <ul style="list-style:none;padding:0;margin:0 0 1.5rem;display:flex;flex-direction:column;gap:0.75rem">
                    <?php $features = [
                        'รองรับ LINE Login & LINE LIFF',
                        'เชื่อมต่อระบบบัญชี Sage 300 ERP (ODBC)',
                        'จัดการใบสั่งซ่อม F-EN-03 & Kanban',
                        'วางแผน PM/AM อัตโนมัติประจำปี',
                        'วิเคราะห์ MTBF / MTTR & Pareto 80/20',
                    ]; foreach ($features as $f): ?>
                    <li style="display:flex;align-items:center;gap:0.75rem;font-size:0.875rem;color:#e2e8f0">
                        <span style="width:20px;height:20px;border-radius:4px;background-color:rgba(2,74,216,0.2);border:1px solid rgba(2,74,216,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                            <i data-lucide="check" class="w-3.5 h-3.5" style="color:var(--color-accent,#024ad8)"></i>
                        </span>
                        <?= htmlspecialchars($f) ?>
                    </li>
                    <?php endforeach; ?>
                </ul>

                <div style="font-size:0.75rem;color:#64748b">
                    &copy; <?= date('Y') ?> บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด &mdash; v2.0
                </div>
            </div>

            <!-- Right — Login Form -->
            <div style="flex:1 1 240px;min-width:240px;padding:var(--spacing-8,2rem);display:flex;flex-direction:column;justify-content:center">
                <div style="max-width:320px;width:100%;margin-inline:auto">

                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:var(--spacing-6,1.5rem)">
                        <i data-lucide="cpu" class="w-5 h-5" style="color:var(--color-accent,#024ad8)"></i>
                        <span style="font-weight:600;font-size:0.9375rem">CMMS-TOPPAN</span>
                    </div>

                    <h2 style="font-size:1.5rem;font-weight:600;line-height:1.25;margin:0 0 0.25rem;color:var(--color-text-primary,#0f172a)">เข้าสู่ระบบ</h2>
                    <p style="font-size:0.875rem;color:var(--color-text-secondary,#64748b);margin:0 0 var(--spacing-6,1.5rem)">เลือกเข้าสู่ระบบด้วย LINE หรือกรอกชื่อผู้ใช้และรหัสผ่าน</p>

                    <?php if ($error): ?>
                    <div style="background-color:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:0.75rem 1rem;border-radius:6px;font-size:0.875rem;display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem">
                        <i data-lucide="alert-circle" class="w-5 h-5 flex-shrink-0"></i>
                        <div><?= htmlspecialchars($error) ?></div>
                    </div>
                    <?php endif; ?>

                    <a href="/line_login.php" style="display:flex;width:100%;height:40px;background-color:#06C755;color:#fff;border-radius:6px;align-items:center;justify-content:center;gap:0.5rem;font-weight:600;font-size:0.75rem;letter-spacing:0.05em;text-transform:uppercase;text-decoration:none;margin-bottom:1.5rem;transition:background-color 0.2s" onmouseover="this.style.backgroundColor='#05b34c'" onmouseout="this.style.backgroundColor='#06C755'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .348-.281.63-.63.63h-2.425v1.145h2.425c.349 0 .63.282.63.63 0 .348-.281.63-.63.63h-3.055c-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63h3.055c.349 0 .63.281.63.63 0 .348-.281.63-.63.63h-2.425v1.145h2.425zm-6.046 3.666c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-2.52 0c0 .248-.146.47-.37.568-.084.036-.173.054-.26.054-.153 0-.305-.056-.425-.164l-2.404-2.857v2.4c0 .348-.281.63-.63.63-.349 0-.63-.282-.63-.63V8.583c0-.248.146-.47.37-.568.084-.035.173-.053.26-.053.153 0 .305.056.425.164l2.404 2.857v-2.4c0-.349.281-.63.63-.63.349 0 .63.281.63.63v4.946zm-7.618 0c0 .348-.281.63-.63.63H.63C.282 14.159 0 13.877 0 13.529V8.583c0-.349.282-.63.63-.63.348 0 .63.281.63.63v4.316h1.259c.348 0 .63.282.63.63z"/></svg>
                        เข้าสู่ระบบด้วย LINE
                    </a>

                    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem">
                        <div style="flex:1;height:1px;background-color:var(--color-border,#e2e8f0)"></div>
                        <span style="font-size:0.75rem;color:var(--color-text-disabled,#94a3b8);text-transform:uppercase;letter-spacing:0.05em;font-weight:500">หรือใช้รหัสผ่าน</span>
                        <div style="flex:1;height:1px;background-color:var(--color-border,#e2e8f0)"></div>
                    </div>

                    <form method="post">
                        <?= csrfField() ?>
                        <div style="margin-bottom:1rem">
                            <label for="username" style="display:block;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary,#64748b);margin-bottom:0.375rem">ชื่อผู้ใช้ (Username)</label>
                            <input type="text" name="username" id="username" class="w-full h-10 px-3 bg-muted border border-border rounded-md text-sm text-primary focus:outline-none focus:border-accent transition-colors placeholder:text-disabled" placeholder="กรอกชื่อผู้ใช้ (e.g. admin, tech01)" autocomplete="username" required value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
                        </div>
                        <div style="margin-bottom:1rem">
                            <label for="password" style="display:block;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary,#64748b);margin-bottom:0.375rem">รหัสผ่าน (Password)</label>
                            <div style="position:relative">
                                <input type="password" name="password" id="password" class="w-full h-10 px-3 pr-10 bg-muted border border-border rounded-md text-sm text-primary focus:outline-none focus:border-accent transition-colors placeholder:text-disabled" placeholder="กรอกรหัสผ่าน" autocomplete="current-password" required>
                                <button type="button" id="toggle-password" aria-label="แสดง/ซ่อนรหัสผ่าน" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--color-text-secondary,#64748b);cursor:pointer;border-radius:6px" onmouseover="this.style.background='var(--color-background-muted,#f1f5f9)'" onmouseout="this.style.background='transparent'">
                                    <svg id="eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    <svg id="eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                </button>
                            </div>
                        </div>
                        <button type="submit" class="w-full h-10 bg-accent hover:bg-accent/90 text-white rounded-md flex items-center justify-center gap-2 font-semibold text-xs tracking-wider uppercase transition-colors shadow-xs" style="margin-top:0.5rem">
                            เข้าสู่ระบบ
                            <i data-lucide="arrow-right" class="w-4 h-4"></i>
                        </button>
                    </form>

                    <div style="margin-top:2rem;padding:1rem;background-color:var(--color-background-muted,#f1f5f9);border:1px solid var(--color-border,#e2e8f0);border-radius:6px">
                        <p style="font-size:0.75rem;color:var(--color-text-secondary,#64748b);margin:0 0 0.5rem;font-weight:500">คลิกเลือกบัญชีทดสอบ (รหัสผ่าน: password):</p>
                        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
                            <button type="button" onclick="fillLogin('admin', 'password')" class="px-2.5 py-1 bg-surface border border-border rounded-sm text-xs font-medium text-primary hover:border-accent hover:text-accent transition-colors">👤 admin</button>
                            <button type="button" onclick="fillLogin('manager', 'password')" class="px-2.5 py-1 bg-surface border border-border rounded-sm text-xs font-medium text-primary hover:border-accent hover:text-accent transition-colors">👔 manager</button>
                            <button type="button" onclick="fillLogin('tech01', 'password')" class="px-2.5 py-1 bg-surface border border-border rounded-sm text-xs font-medium text-primary hover:border-accent hover:text-accent transition-colors">🔧 tech01</button>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    </div>
</div>

<script>
    lucide.createIcons();
    function fillLogin(u, p) {
        document.getElementById('username').value = u;
        document.getElementById('password').value = p;
        document.getElementById('username').focus();
    }
    // แสดง/ซ่อนรหัสผ่าน
    (function () {
        var btn = document.getElementById('toggle-password');
        var pw = document.getElementById('password');
        if (!btn || !pw) return;
        btn.addEventListener('click', function () {
            var show = pw.type === 'password';
            pw.type = show ? 'text' : 'password';
            document.getElementById('eye-open').style.display = show ? 'none' : 'block';
            document.getElementById('eye-closed').style.display = show ? 'block' : 'none';
            pw.focus();
        });
    })();
    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        const input = document.getElementById('username');
        if ((params.has('error') || window.location.href.includes('400')) && input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
</script>
</body>
</html>
