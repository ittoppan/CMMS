<?php
declare(strict_types=1);
/**
 * Page header helper — Redesign Plan Step 1
 *
 * Renders the canonical header (.cp-header) with optional breadcrumb,
 * title, description, icon and action buttons.
 *
 * @param string $title       Main heading (required)
 * @param string $description One-line description below the title
 * @param array  $actions     Array of HTML strings or ['label'=>..., 'href'=>..., 'variant'=>...] entries
 * @param array  $breadcrumbs Array of ['label'=>..., 'href'=>...] entries; last = current page
 * @param string $icon        Optional emoji/svg HTML rendered before the title
 */
function renderPageHeader(
    string $title,
    string $description = '',
    array $actions = [],
    array $breadcrumbs = [],
    string $icon = ''
): void {
    if ($breadcrumbs) {
        echo '<nav class="cp-breadcrumb" aria-label="Breadcrumb">';
        $last = count($breadcrumbs) - 1;
        foreach ($breadcrumbs as $i => $crumb) {
            $label = htmlspecialchars((string)($crumb['label'] ?? ''), ENT_QUOTES, 'UTF-8');
            $href  = $crumb['href'] ?? null;
            $isLast = $i === $last;
            if (!$isLast && $href) {
                echo '<a href="' . htmlspecialchars((string)$href, ENT_QUOTES, 'UTF-8') . '">' . $label . '</a>';
                echo '<span class="cp-breadcrumb-sep" aria-hidden="true">›</span>';
            } elseif ($isLast) {
                echo '<span class="cp-breadcrumb-current" aria-current="page">' . $label . '</span>';
            } else {
                echo '<span>' . $label . '</span>';
                if (!$isLast) echo '<span class="cp-breadcrumb-sep" aria-hidden="true">›</span>';
            }
        }
        echo '</nav>';
    }

    echo '<div class="cp-header">';
    echo '<div class="min-w-0">';
    echo '<h1 class="cp-header-title">';
    if ($icon !== '') echo $icon . ' ';
    echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    echo '</h1>';
    if ($description !== '') {
        echo '<p class="cp-header-desc">' . htmlspecialchars($description, ENT_QUOTES, 'UTF-8') . '</p>';
    }
    echo '</div>';

    if ($actions) {
        echo '<div class="cp-header-actions">';
        foreach ($actions as $a) {
            if (is_string($a)) {
                echo $a;
            } elseif (is_array($a) && isset($a['label'])) {
                $label = htmlspecialchars((string)$a['label'], ENT_QUOTES, 'UTF-8');
                $href  = $a['href'] ?? null;
                $variant = $a['variant'] ?? 'primary';
                $cls = $variant === 'secondary' ? 'btn btn-secondary' : ($variant === 'ghost' ? 'btn btn-ghost' : 'btn btn-primary');
                if ($href) {
                    echo '<a href="' . htmlspecialchars((string)$href, ENT_QUOTES, 'UTF-8') . '" class="' . $cls . '">' . $label . '</a>';
                } else {
                    echo '<button type="button" class="' . $cls . '">' . $label . '</button>';
                }
            }
        }
        echo '</div>';
    }
    echo '</div>';
}
