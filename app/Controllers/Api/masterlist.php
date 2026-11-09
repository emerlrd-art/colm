<?php
// Semester master lists, validation records and the archive (admin only; archived records are read-only).
//
//   POST ?action=check      CSV file "csv" only: checks the content of the file (nothing to do with the academic year), saves nothing.
//   POST ?action=import     CSV file "csv" + academic_year + semester (1,2,3). dry_run=1 only shows what would happen.
//                           older active lists are archived automatically in the same transaction as the import.
//   GET  ?action=imports    every imported list (active and archived)
//   GET  ?action=records    search: academic_year, semester, student_no, name, status, scope (active|archived|all), archived_from, archived_to, page
//   GET  ?action=periods    the options for the filters
//   GET  ?action=student_history&student_no=...   one student's records of every semester (admin)
//   GET  ?action=my_history                       the logged-in student's own records of every semester (students only, read-only)
require_once __DIR__ . '/../../Middleware/auth.php';
require_once __DIR__ . '/../../Models/masterlist.php';
register_error_handlers();

$action = $_GET['action'] ?? 'imports';

// A student may only read the history of their OWN student ID. Everything else here is for the staff.
if ($action === 'my_history') {
    require_method('GET');
    $me = require_login(['student']);
    $row = fetch_one('SELECT student_no, username FROM users WHERE id = ?', [(int)$me['id']]);
    json_response(['ok' => true, 'history' => student_validation_history(($row['student_no'] ?? '') ?: ($row['username'] ?? ''))]);
}
$user = require_login(['admin']);

switch ($action) {
    case 'imports':
        require_method('GET');
        archive_expired_master_lists($user);
        $rows = fetch_all('SELECT m.id, m.academic_year, m.semester, m.status, m.row_count, m.imported_at, m.archived_at, m.archive_note, u.full_name AS imported_by
                           FROM master_list_imports m LEFT JOIN users u ON u.id = m.imported_by ORDER BY m.period_key DESC');
        foreach ($rows as &$row) { $row['id'] = (int)$row['id']; $row['semester_label'] = SEMESTER_LABELS[(int)$row['semester']] ?? ''; }
        json_response(['ok' => true, 'imports' => $rows]);

    case 'current_enrollments':
        require_method('GET');
        archive_expired_master_lists($user);
        $academicYear = current_academic_year();
        $result = search_validation_records(['academic_year' => $academicYear, 'scope' => 'active'], (int)($_GET['page'] ?? 1));
        foreach ($result['records'] as &$record) $record['enrollment_status'] = 'currently_enrolled';
        unset($record);
        json_response(['ok' => true, 'academic_year' => $academicYear] + $result);

    case 'periods':
        require_method('GET');
        json_response(['ok' => true,
            'academic_years' => array_column(fetch_all('SELECT DISTINCT academic_year FROM master_list_imports ORDER BY academic_year DESC'), 'academic_year'),
            'semesters' => SEMESTER_LABELS]);

    case 'student_history':
        require_method('GET');
        $studentNo = clean_text($_GET['student_no'] ?? '', 30);
        if ($studentNo === '') fail('Student ID is required.', 422);
        json_response(['ok' => true, 'history' => student_validation_history($studentNo)]);

    case 'records':
        require_method('GET');
        $filters = [];
        foreach (['academic_year', 'semester', 'student_no', 'name', 'status', 'scope', 'archived_from', 'archived_to'] as $key) $filters[$key] = clean_text($_GET[$key] ?? '', 80);
        json_response(['ok' => true] + search_validation_records($filters, (int)($_GET['page'] ?? 1)));

    case 'check':
    case 'import':
        require_method('POST');
        require_csrf();
        $file = $_FILES['csv'] ?? null;
        if (!$file || $file['error'] === UPLOAD_ERR_NO_FILE) fail('Choose a CSV file first.', 422);
        if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) fail('The upload failed. Please try again.', 422);
        if ($file['size'] > 2 * 1024 * 1024) fail('The CSV file is too large (maximum 2 MB).', 422);
        if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'csv') fail('Please upload a .csv file.', 422);
        try {
            if ($action === 'check') json_response(['ok' => true] + check_master_list_file($file['tmp_name']));
            $result = import_master_list($file['tmp_name'], $_POST['academic_year'] ?? '', $_POST['semester'] ?? '', $user, !empty($_POST['dry_run']));
        } catch (RuntimeException $e) {
            fail($e->getMessage(), 422);
        }
        json_response(['ok' => true] + $result, $result['saved'] ? 201 : 200);

    default:
        fail('Unknown action.', 404);
}