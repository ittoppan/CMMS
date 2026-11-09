<?php
// E2E Phase 26: delete the throwaway 2031-01 budget row (auth-less DB cleanup).
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$pdo->exec("DELETE FROM budget_adjustment WHERE budget_id IN (SELECT id FROM budget_plan WHERE year = 2031 AND month = 1)");
echo "adjustments:" . $pdo->exec("DELETE FROM budget_plan WHERE year = 2031 AND month = 1");