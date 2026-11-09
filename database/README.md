# Database

`install.sql` holds the table structure and the document catalog. `php database/install.php` creates a fresh database or upgrades a compatible database for this application. Export a backup before running it: upgrades can change columns, roles, and catalog activity. The installer preserves upload-check history and deactivates the retired Form 137 catalog entry instead of deleting its requirements or history.

The installer rejects a non-empty database unless its `users` table has this application's legacy identity columns. That includes the known alternate schema using `users.role_id`/`users.student_number` and `requests.request_number`. It performs this check before schema or data changes. Do not try to make an alternate database fit by running the installer; use a separately reviewed migration. Automatic startup upgrades are likewise skipped when the legacy identity schema is not detected.

Accounts are stored in the `users` table with hashed passwords; nothing is defined in the frontend.
