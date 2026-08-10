<?php
$search         = trim($_GET['search']   ?? '');
$filterStatus   = trim($_GET['status']   ?? '');
$filterPriority = trim($_GET['priority'] ?? '');
$hasFilters     = $search !== '' || $filterStatus !== '' || $filterPriority !== '';
?>
<form method="GET" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">

    <!-- Search input -->
    <div class="search-input-wrap" style="flex:1;min-width:200px;">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
            type="text" name="search"
            value="<?= htmlspecialchars($search) ?>"
            placeholder="ค้นหา..."
            style="padding-left:34px;">
    </div>

    <?php if (isset($statusOptions)): ?>
    <div style="min-width:140px;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:5px;letter-spacing:0.3px;">สถานะ</label>
        <select name="status">
            <option value="">ทั้งหมด</option>
            <?php foreach ($statusOptions as $val => $lbl): ?>
            <option value="<?= htmlspecialchars($val) ?>" <?= $filterStatus === $val ? 'selected' : '' ?>><?= htmlspecialchars($lbl) ?></option>
            <?php endforeach; ?>
        </select>
    </div>
    <?php endif; ?>

    <?php if (isset($priorityOptions)): ?>
    <div style="min-width:140px;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:5px;letter-spacing:0.3px;">ความสำคัญ</label>
        <select name="priority">
            <option value="">ทั้งหมด</option>
            <?php foreach ($priorityOptions as $val => $lbl): ?>
            <option value="<?= htmlspecialchars($val) ?>" <?= $filterPriority === $val ? 'selected' : '' ?>><?= htmlspecialchars($lbl) ?></option>
            <?php endforeach; ?>
        </select>
    </div>
    <?php endif; ?>

    <button type="submit" class="btn btn-primary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        ค้นหา
    </button>

    <?php if ($hasFilters): ?>
    <a href="?" class="btn btn-secondary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ล้าง
    </a>
    <?php endif; ?>

</form>
