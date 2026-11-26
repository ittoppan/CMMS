-- Add Microsoft account binding column to users (for "Login with Microsoft")
ALTER TABLE users
  ADD COLUMN `microsoft_user_id` VARCHAR(100) NULL AFTER `line_user_id`;

ALTER TABLE users
  ADD KEY `idx_users_microsoft_user_id` (`microsoft_user_id`);