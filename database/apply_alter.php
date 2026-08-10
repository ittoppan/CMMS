<?php
require __DIR__ . '/../src/config/db.php';

try {
    $pdo = getDb();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    // Repair: modify status enum
    $pdo->exec("ALTER TABLE repair MODIFY COLUMN `status` ENUM('open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled','rejected') NOT NULL DEFAULT 'open'");
    echo "OK: repair status modified\n";

    // Repair: add new columns
    $pdo->exec("ALTER TABLE repair
        ADD COLUMN `repair_type_id` INT UNSIGNED NULL AFTER `created_by`,
        ADD COLUMN `failure_code_id` INT UNSIGNED NULL AFTER `repair_type_id`,
        ADD COLUMN `repair_code_id` INT UNSIGNED NULL AFTER `failure_code_id`,
        ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `repair_code_id`,
        ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `work_zone_id`,
        ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `location_id`,
        ADD COLUMN `safety_related` TINYINT(1) NOT NULL DEFAULT 0 AFTER `department_id`,
        ADD COLUMN `product_lot_no` VARCHAR(100) NULL AFTER `safety_related`,
        ADD COLUMN `machine_status` ENUM('running','stopped','idle','standby') NULL AFTER `product_lot_no`,
        ADD COLUMN `production_line_status` ENUM('normal','stopped','slowdown') NULL AFTER `machine_status`,
        ADD COLUMN `estimated_completion_date` DATETIME NULL AFTER `production_line_status`,
        ADD COLUMN `actual_start_at` DATETIME NULL AFTER `estimated_completion_date`,
        ADD COLUMN `acknowledged_at` DATETIME NULL AFTER `actual_start_at`,
        ADD COLUMN `root_cause` TEXT NULL AFTER `resolution`,
        ADD COLUMN `solution` TEXT NULL AFTER `root_cause`,
        ADD COLUMN `rejection_reason_id` INT UNSIGNED NULL AFTER `solution`,
        ADD COLUMN `rejection_note` TEXT NULL AFTER `rejection_reason_id`");
    echo "OK: repair new columns added\n";

    // Repair: FKs
    $pdo->exec("ALTER TABLE repair
        ADD KEY `fk_r_repair_type` (`repair_type_id`),
        ADD KEY `fk_r_failure_code` (`failure_code_id`),
        ADD KEY `fk_r_repair_code` (`repair_code_id`),
        ADD KEY `fk_r_work_zone` (`work_zone_id`),
        ADD KEY `fk_r_location` (`location_id`),
        ADD KEY `fk_r_department` (`department_id`),
        ADD KEY `fk_r_rejection_reason` (`rejection_reason_id`)");
    $pdo->exec("ALTER TABLE repair
        ADD CONSTRAINT `fk_r_repair_type` FOREIGN KEY (`repair_type_id`) REFERENCES `repair_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_failure_code` FOREIGN KEY (`failure_code_id`) REFERENCES `failure_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_repair_code` FOREIGN KEY (`repair_code_id`) REFERENCES `repair_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_r_rejection_reason` FOREIGN KEY (`rejection_reason_id`) REFERENCES `rejection_reasons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    echo "OK: repair FKs added\n";

    // Calibration: add new columns
    $pdo->exec("ALTER TABLE calibration
        ADD COLUMN `calibration_type` ENUM('full','abbreviated') NOT NULL DEFAULT 'full' AFTER `performed_by`,
        ADD COLUMN `total_cost` DECIMAL(12,2) NULL AFTER `certificate_number`,
        ADD COLUMN `po_number` VARCHAR(100) NULL AFTER `total_cost`,
        ADD COLUMN `supplier_id` INT UNSIGNED NULL AFTER `po_number`,
        ADD COLUMN `certificate_file` VARCHAR(500) NULL AFTER `supplier_id`,
        ADD COLUMN `status` ENUM('scheduled','in_progress','completed','overdue','cancelled') NOT NULL DEFAULT 'scheduled' AFTER `result`");
    echo "OK: calibration new columns added\n";

    $pdo->exec("ALTER TABLE calibration
        ADD KEY `fk_c_supplier_id` (`supplier_id`),
        ADD CONSTRAINT `fk_c_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    echo "OK: calibration FKs added\n";

    // Users: add department reference
    $pdo->exec("ALTER TABLE users
        ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `role_id`,
        ADD COLUMN `employee_code` VARCHAR(50) NULL AFTER `department_id`,
        ADD COLUMN `position` VARCHAR(200) NULL AFTER `employee_code`,
        ADD COLUMN `signature_path` VARCHAR(500) NULL AFTER `position`");
    echo "OK: users new columns added\n";

    $pdo->exec("ALTER TABLE users
        ADD KEY `fk_u_department_id` (`department_id`),
        ADD CONSTRAINT `fk_u_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    echo "OK: users FKs added\n";

    // pm_am: add new columns
    $pdo->exec("ALTER TABLE pm_am
        ADD COLUMN `plan_id` INT UNSIGNED NULL AFTER `assigned_to`,
        ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `plan_id`,
        ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `department_id`,
        ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `location_id`,
        ADD COLUMN `work_instruction_file` VARCHAR(500) NULL AFTER `notes`,
        ADD COLUMN `completed_at` DATETIME NULL AFTER `work_instruction_file`,
        ADD COLUMN `completed_by` INT UNSIGNED NULL AFTER `completed_at`,
        ADD COLUMN `reschedule_reason` TEXT NULL AFTER `completed_by`");
    echo "OK: pm_am new columns added\n";

    $pdo->exec("ALTER TABLE pm_am
        ADD KEY `fk_pm_plan_id` (`plan_id`),
        ADD KEY `fk_pm_department` (`department_id`),
        ADD KEY `fk_pm_location` (`location_id`),
        ADD KEY `fk_pm_work_zone` (`work_zone_id`),
        ADD KEY `fk_pm_completed_by` (`completed_by`)");
    $pdo->exec("ALTER TABLE pm_am
        ADD CONSTRAINT `fk_pm_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_pm_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_pm_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_pm_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT `fk_pm_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    echo "OK: pm_am FKs added\n";

    // equipment_borrowing: add new columns
    $pdo->exec("ALTER TABLE equipment_borrowing
        ADD COLUMN `borrowing_type` ENUM('single','group') NOT NULL DEFAULT 'single' AFTER `processed_by`,
        ADD COLUMN `reason_id` INT UNSIGNED NULL AFTER `borrowing_type`,
        ADD COLUMN `reason_detail` TEXT NULL AFTER `reason_id`");
    echo "OK: equipment_borrowing new columns added\n";

    $pdo->exec("ALTER TABLE equipment_borrowing
        ADD KEY `fk_eb_reason_id` (`reason_id`),
        ADD CONSTRAINT `fk_eb_reason` FOREIGN KEY (`reason_id`) REFERENCES `borrowing_reasons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE");
    echo "OK: equipment_borrowing FKs added\n";

    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    echo "\nAll ALTER operations completed successfully!\n";

} catch (Exception $e) {
    echo 'Error: ' . $e->getMessage() . "\n";
}
