<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$id = (int)($_GET['id'] ?? 0);
if ($id) {
    try {
        $pdo = getDb();
        $pdo->beginTransaction();
        $atts = $pdo->prepare('SELECT file_path FROM repair_attachments WHERE repair_id = ?'); $atts->execute([$id]);
        foreach ($atts as $att) {
            $fp = __DIR__ . '/../../../' . $att['file_path'];
            if (file_exists($fp)) unlink($fp);
        }
        $pdo->prepare('DELETE FROM repair_attachments WHERE repair_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM repair_tag_pivot WHERE repair_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM repair_activity_log WHERE repair_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM repair_ratings WHERE repair_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM repair WHERE id = ?')->execute([$id]);
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
    }
}
header('Location: index.php');
