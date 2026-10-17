<?php
require_once __DIR__ . '/../../../src/includes/gone_next.php';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id > 0) {
    redirect_to_next('/asset-reliability/assets/' . $id, false);
}
redirect_to_next('/asset-reliability');
