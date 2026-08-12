<?php
/**
 * CMMS-TPT Bottom Nav Resolver — อ่านปุ่มล่างของบทบาทจากตาราง bottom_nav_config
 *
 * กติกา:
 *  - มีแถวในตาราง (ตั้งค่าแล้ว)  -> ใช้ลำดับตาม sort_order
 *  - ไม่มีแถว (ยังไม่เคยตั้งค่า) -> ใช้ preset เริ่มต้นจาก bottom_nav_catalog.php
 *  - DB error -> fallback preset เดิม (ไม่พัง)
 */
$bottomNavCatalog = require __DIR__ . '/bottom_nav_catalog.php';

function bottomNavCatalog(): array
{
    static $cat = null;
    if ($cat === null) {
        $cat = require __DIR__ . '/bottom_nav_catalog.php';
    }
    return $cat;
}

/**
 * คืน array ของ menu_key ที่เป็นปุ่มล่างของบทบาท (เรียงลำดับแล้ว)
 *
 * @param PDO|null $pdo       connection (null = คืน preset ทันที)
 * @param int      $roleId    roles.id
 * @param string   $roleSlug  ชื่อบทบาท (พิมพ์เล็ก) เช่น 'admin', 'technician'
 * @return string[]
 */
function resolveBottomNavKeys(?PDO $pdo, int $roleId, string $roleSlug): array
{
    $cat = bottomNavCatalog();
    $slug = strtolower(trim($roleSlug));
    $defaults = $cat['defaults'][$slug] ?? ['dashboard', 'repair/request', 'pm_am/calendar', 'asset_registry', 'settings'];

    if (!$pdo || !$roleId) {
        return $defaults;
    }

    try {
        $stmt = $pdo->prepare(
            "SELECT menu_key FROM bottom_nav_config
             WHERE role_id = ? ORDER BY sort_order ASC, menu_key ASC"
        );
        $stmt->execute([$roleId]);
        $rows = array_values(array_filter(
            $stmt->fetchAll(PDO::FETCH_COLUMN),
            fn($k) => isset($cat['meta'][$k]) // กัน key เก่า/ไม่รู้จักที่อาจค้างในตาราง
        ));
        return $rows ?: $defaults;
    } catch (Throwable $e) {
        return $defaults;
    }
}
