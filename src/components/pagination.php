<?php
/**
 * Reusable Pagination Bar Component
 */
if (!function_exists('renderPagination')) {
    function renderPagination($currentPage, $totalPages, $totalRecords, $limit = 10) {
        if ($totalPages <= 1 && $totalRecords <= $limit) return;
        
        $queryParams = $_GET;
        ?>
        <div class="flex items-center justify-between flex-wrap gap-4 px-4 py-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 text-xs">
            <div class="text-slate-500 font-medium">
                แสดงผล <strong><?= number_format(min($totalRecords, ($currentPage - 1) * $limit + 1)) ?></strong> ถึง <strong><?= number_format(min($totalRecords, $currentPage * $limit)) ?></strong> จากทั้งหมด <strong><?= number_format($totalRecords) ?></strong> รายการ
            </div>

            <div class="flex items-center gap-2">
                <!-- Limit Selector -->
                <select onchange="const p=new URLSearchParams(window.location.search); p.set('limit', this.value); p.set('page', 1); window.location.search=p.toString();" class="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 font-bold text-xs cursor-pointer">
                    <option value="10" <?= $limit == 10 ? 'selected' : '' ?>>10 รายการ/หน้า</option>
                    <option value="25" <?= $limit == 25 ? 'selected' : '' ?>>25 รายการ/หน้า</option>
                    <option value="50" <?= $limit == 50 ? 'selected' : '' ?>>50 รายการ/หน้า</option>
                    <option value="100" <?= $limit == 100 ? 'selected' : '' ?>>100 รายการ/หน้า</option>
                </select>

                <!-- Page Buttons -->
                <div class="inline-flex rounded-lg shadow-sm">
                    <?php if ($currentPage > 1): 
                        $queryParams['page'] = $currentPage - 1;
                        $prevUrl = '?' . http_build_query($queryParams);
                    ?>
                    <a href="<?= $prevUrl ?>" class="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-l-lg hover:bg-slate-100">« ก่อนหน้า</a>
                    <?php else: ?>
                    <span class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 font-bold rounded-l-lg cursor-not-allowed">« ก่อนหน้า</span>
                    <?php endif; ?>

                    <?php for ($i = 1; $i <= $totalPages; $i++): 
                        if ($i == 1 || $i == $totalPages || ($i >= $currentPage - 2 && $i <= $currentPage + 2)):
                            $queryParams['page'] = $i;
                            $pageUrl = '?' . http_build_query($queryParams);
                    ?>
                    <a href="<?= $pageUrl ?>" class="px-3 py-1.5 border border-slate-200 dark:border-slate-600 font-bold <?= $i == $currentPage ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100' ?>">
                        <?= $i ?>
                    </a>
                    <?php elseif ($i == 2 || $i == $totalPages - 1): ?>
                    <span class="px-2 py-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-400">...</span>
                    <?php endif; endfor; ?>

                    <?php if ($currentPage < $totalPages): 
                        $queryParams['page'] = $currentPage + 1;
                        $nextUrl = '?' . http_build_query($queryParams);
                    ?>
                    <a href="<?= $nextUrl ?>" class="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-r-lg hover:bg-slate-100">ถัดไป »</a>
                    <?php else: ?>
                    <span class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 font-bold rounded-r-lg cursor-not-allowed">ถัดไป »</span>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }
}
