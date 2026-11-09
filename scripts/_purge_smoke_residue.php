<?php
/** scripts/_purge_smoke_residue.php - remove rows left by interrupted Phase 38 smoke runs */
require_once __DIR__ . '/../src/config/db.php';
$p = getDb();
$dry = !in_array('--apply', $argv, true);

$steps = [
    'search logs from the search probe' =>
        "DELETE FROM knowledge_search_log WHERE normalized_query LIKE 'probe%'",
    'tags created by a smoke run' =>
        "DELETE FROM knowledge_tag WHERE tag LIKE 'smoke-%' AND id NOT IN (SELECT tag_id FROM knowledge_article_tag)",
    'tags created by an article payload' =>
        "DELETE FROM knowledge_tag WHERE tag IN ('smoke-test','pump') AND id NOT IN (SELECT tag_id FROM knowledge_article_tag)",
    'categories created by a smoke run' =>
        "DELETE FROM knowledge_category WHERE code LIKE 'SMTK-%'",
    'tag activity pointing at a deleted tag' =>
        "DELETE FROM knowledge_activity WHERE entity_type IN ('tag','knowledge_tag') AND entity_id NOT IN (SELECT id FROM knowledge_tag)",
    'category activity pointing at a deleted category' =>
        "DELETE FROM knowledge_activity WHERE entity_type IN ('category','knowledge_category') AND entity_id NOT IN (SELECT id FROM knowledge_category)",
    'gaps opened by a smoke run' =>
        "DELETE FROM knowledge_gap WHERE search_term LIKE '%zzz-no-such-knowledge-%'",
];

foreach ($steps as $label => $sql) {
    if ($dry) {
        echo 'would run: ' . $label . PHP_EOL;
        continue;
    }
    $n = $p->exec($sql);
    echo str_pad($label, 48) . $n . ' row(s)' . PHP_EOL;
}

if ($dry) {
    echo PHP_EOL . 'dry run - pass --apply to purge' . PHP_EOL;
} else {
    foreach (['knowledge_article', 'knowledge_activity', 'knowledge_usage', 'knowledge_search_log',
              'knowledge_review', 'knowledge_gap', 'knowledge_tag', 'knowledge_category'] as $t) {
        echo str_pad($t, 26) . (int)$p->query("SELECT COUNT(*) FROM `$t`")->fetchColumn() . PHP_EOL;
    }
}
