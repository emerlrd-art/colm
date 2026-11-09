<?php
// Semester master lists and their validation records.
//
// A "master list import" is one CSV of the students enrolled in ONE semester of ONE academic year. Every row becomes a validation record:
//   VALIDATED      the student has a portal account and name, course and year level agree with the list
//   MISMATCH       the account exists but something differs (the note says what)
//   (NOT_REGISTERED is no longer produced: students request as guests with their Gmail, so a portal account is not needed.)
//   INVALID        the row itself is unusable (for example the ID has the wrong format)
// When a NEWER semester is imported, the older ACTIVE imports are archived (status ARCHIVED). Records are never copied, changed or deleted:
// "archived" is the status of the import they belong to, so history can not be overwritten by a later import.
require_once __DIR__ . '/students.php';
require_once __DIR__ . '/../Utils/names.php';
require_once __DIR__ . '/audit.php';

const SEMESTER_LABELS = [1 => '1st Semester', 2 => '2nd Semester', 3 => 'Summer'];

// 2025-2026 + 2nd Semester => 20252. Bigger = later. Returns null when the academic year or the semester is not valid.
function master_period_key($academicYear, $semester) {
    $semester = (int)$semester;
    if (!isset(SEMESTER_LABELS[$semester]) || !valid_academic_year($academicYear)) return null;
    return (int)substr($academicYear, 0, 4) * 10 + $semester;
}

function master_period_label($academicYear, $semester) {
    return (SEMESTER_LABELS[(int)$semester] ?? 'Semester ' . (int)$semester) . ', A.Y. ' . $academicYear;
}

function current_academic_year() {
    $start = (int)date('Y');
    return $start . '-' . ($start + 1);
}

function active_student_academic_year($studentNo) {
    $studentNo = trim((string)$studentNo);
    if ($studentNo === '') return '';
    $record = fetch_one("SELECT m.academic_year
                         FROM validation_records v
                         JOIN master_list_imports m ON m.id = v.import_id
                         WHERE v.student_no = ? AND m.status = 'ACTIVE'
                         ORDER BY m.period_key DESC, v.id DESC
                         LIMIT 1", [$studentNo]);
    return trim((string)($record['academic_year'] ?? ''));
}

function current_enrollment_masterlist_record($studentNo) {
    $studentNo = trim((string)$studentNo);
    if ($studentNo === '') return null;
    return fetch_one("SELECT v.student_no, v.student_name, v.course, v.year_level, v.validation_status, v.validation_note,
                             m.academic_year, m.semester, m.period_key
                      FROM validation_records v
                      JOIN master_list_imports m ON m.id = v.import_id
                      WHERE v.student_no = ? AND m.academic_year = ? AND m.status = 'ACTIVE'
                      ORDER BY m.period_key DESC, v.id DESC
                      LIMIT 1", [$studentNo, current_academic_year()]);
}

function current_enrollment_masterlist_problem($studentNo) {
    $record = current_enrollment_masterlist_record($studentNo);
    if (!$record) return 'Your current enrollment is not verified on the active Masterlist for A.Y. ' . current_academic_year() . '. Please contact the Registrar.';
    if ($record['validation_status'] !== 'VALIDATED') {
        return 'Your active Masterlist record could not be validated'
            . ($record['validation_note'] ? ': ' . $record['validation_note'] : '.')
            . ' Please contact the Registrar.';
    }
    return '';
}

function master_imports_to_archive(array $imports, $currentAcademicYear) {
    $currentStart = (int)substr((string)$currentAcademicYear, 0, 4);
    return array_values(array_filter($imports, fn($import) =>
        $import['status'] === 'ACTIVE' && (int)substr((string)$import['academic_year'], 0, 4) < $currentStart));
}

function archive_expired_master_lists($user) {
    $academicYear = current_academic_year();
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $active = fetch_all("SELECT id, academic_year, semester, status FROM master_list_imports WHERE status = 'ACTIVE' ORDER BY period_key FOR UPDATE");
        $toArchive = master_imports_to_archive($active, $academicYear);
        $now = date('Y-m-d H:i:s');
        foreach ($toArchive as $old) {
            $changed = query("UPDATE master_list_imports SET status = 'ARCHIVED', archived_at = ?, archived_by = ?, archive_note = ? WHERE id = ? AND status = 'ACTIVE'",
                [$now, $user['id'], 'Archived automatically when academic year ' . $academicYear . ' became current.', $old['id']])->rowCount();
            if ($changed) audit_log('masterlist_archive', 'master_list', (int)$old['id'], null, $user['id'], 'ACTIVE', 'ARCHIVED', 'Archived automatically when academic year ' . $academicYear . ' became current.');
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return count($toArchive);
}

// Compares one CSV row with the portal account. Returns [status, note].
function master_row_status($data, $structure = null) {
    $studentNo = trim((string)($data['student_id'] ?? ''));
    $name = trim((string)($data['full_name'] ?? ''));
    $structure = $structure ?? school_structure();
    // Every row is checked on all columns; all the problems of the row are reported together.
    $problems = [];
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{3,29}$/', $studentNo)) $problems[] = 'the student ID has the wrong format';
    if ($name === '') $problems[] = 'the name is empty';
    // Course: only a course that exists in the school list.
    $courseIn = trim((string)($data['course'] ?? ''));
    if ($courseIn === '') $problems[] = 'the course is empty';
    elseif (level_of_course($courseIn, $structure) === null) $problems[] = 'the course "' . mb_substr($courseIn, 0, 40) . '" is not in the school course list';
    // Year level: 1 to 4 only.
    $yearIn = trim((string)($data['year'] ?? ''));
    $yearNo = $yearIn === '' ? null : parse_year_level($yearIn);
    if ($yearIn === '') $problems[] = 'the year level is empty';
    elseif ($yearNo === null || $yearNo < 1 || $yearNo > 4) $problems[] = 'the year level must be 1 to 4';
    // Gmail: must be a valid @gmail.com address.
    $email = trim((string)($data['email'] ?? ''));
    if ($email === '') $problems[] = 'the Gmail address is empty';
    elseif (!preg_match('/^[A-Za-z0-9._%+-]+@gmail\.com$/i', $email)) $problems[] = 'the Gmail address must end with @gmail.com';
    if ($problems) return ['INVALID', mb_substr(ucfirst(implode('; ', $problems)) . '.', 0, 250)];

    $account = fetch_one("SELECT u.full_name, s.course, s.year_level, s.school_level FROM users u
                          LEFT JOIN students s ON s.user_id = u.id
                          WHERE u.role = 'student' AND (u.student_no = ? OR u.username = ?) LIMIT 1", [$studentNo, $studentNo]);
    if (!$account) return ['VALIDATED', null];            // no portal account needed: the student is checked by the list and the Gmail code

    $problems = [];
    // names_match() returns ['match' => bool, 'score' => n]; both directions must agree (it accepts any word order and one wrong letter in a long word).
    if (!names_match($account['full_name'], $name)['match'] || !names_match($name, $account['full_name'])['match']) $problems[] = 'name';
    $course = trim((string)($data['course'] ?? ''));
    if ($course !== '' && mb_strtolower($course) !== mb_strtolower((string)$account['course'])) $problems[] = 'course';
    $year = trim((string)($data['year'] ?? ''));
    if ($year !== '') {
        $parsed = parse_year_level($year);
        if ($parsed === null || (int)$parsed !== (int)$account['year_level']) $problems[] = 'year level';
    }
    if ($problems) return ['MISMATCH', 'The list and the portal account differ: ' . implode(', ', $problems) . '.'];
    return ['VALIDATED', null];
}

// Reads the CSV and checks every row. Depends only on what is IN the file (columns, course, year level, Gmail), not on any academic year or semester.
// Throws RuntimeException when the file itself can not be used. Returns the records to save and the summary for the browser.
function check_master_csv($path) {
    $rows = read_students_csv($path, ['student_id', 'full_name', 'course', 'year', 'email']);       // all five columns are required: a file with other columns is refused
    $hash = hash_file('sha256', $path);

    $structure = school_structure();
    $invalid = [];
    $records = []; $skipped = []; $seen = []; $counts = ['VALIDATED' => 0, 'MISMATCH' => 0, 'NOT_REGISTERED' => 0, 'INVALID' => 0];
    foreach ($rows as $row) {
        $data = $row['data'];
        $studentNo = trim((string)($data['student_id'] ?? ''));
        if ($studentNo === '') { $skipped[] = ['line' => $row['line'], 'reason' => 'No student ID.']; continue; }
        $dupKey = mb_strtolower($studentNo);
        if (isset($seen[$dupKey])) { $skipped[] = ['line' => $row['line'], 'reason' => "Student ID $studentNo appears twice (first on line {$seen[$dupKey]}). The first one is used."]; continue; }
        $seen[$dupKey] = $row['line'];
        [$status, $note] = master_row_status($data, $structure);
        $counts[$status]++;
        if ($status === 'INVALID' && count($invalid) < 100) $invalid[] = ['line' => $row['line'], 'student_id' => mb_substr($studentNo, 0, 30), 'reason' => $note];
        $records[] = [
            'student_no' => mb_substr($studentNo, 0, 30), 'name' => mb_substr(trim((string)($data['full_name'] ?? '')) ?: '(no name)', 0, 150),
            'course' => mb_substr(trim((string)($data['course'] ?? '')), 0, 100) ?: null,
            'year' => mb_substr(trim((string)($data['year'] ?? '')), 0, 30) ?: null,
            'status' => $status, 'note' => $note,
        ];
    }
    if (!$records) throw new RuntimeException('The file has no usable student rows.');
    return ['hash' => $hash, 'records' => $records, 'counts' => $counts, 'skipped' => $skipped, 'invalid' => $invalid];
}

// Content check only (used by the automatic check in the browser): no academic year, no semester, nothing is saved.
function check_master_list_file($path) {
    $c = check_master_csv($path);
    return ['rows' => count($c['records']), 'counts' => $c['counts'], 'skipped' => $c['skipped'], 'invalid' => $c['invalid']];
}

// Checks the file, then (unless $dryRun) saves the import and archives the older active imports in ONE database transaction.
// Throws RuntimeException with a clear message when the import must not happen. Returns the plan / result for the browser.
function import_master_list($path, $academicYear, $semester, $user, $dryRun) {
    $academicYear = trim((string)$academicYear);
    $key = master_period_key($academicYear, $semester);
    if ($key === null) throw new RuntimeException('Choose a valid academic year (for example 2025-2026) and semester.');
    $semester = (int)$semester;

    $checked = check_master_csv($path);
    $hash = $checked['hash']; $records = $checked['records']; $counts = $checked['counts']; $skipped = $checked['skipped']; $invalid = $checked['invalid'];
    if ($counts['INVALID'] > 0) throw new RuntimeException($counts['INVALID'] . ' row(s) in the file have errors. Fix the file first (course, year level 1-4, @gmail.com).');

    $pdo = db();
    try {
        $pdo->beginTransaction();
        // The table is small; locking every row makes two people importing at the same time wait for each other.
        $imports = fetch_all('SELECT id, academic_year, semester, period_key, file_sha256, status FROM master_list_imports ORDER BY period_key FOR UPDATE');

        foreach ($imports as $existing) {
            if ($existing['file_sha256'] === $hash) {
                throw new RuntimeException('This exact file was already imported as ' . master_period_label($existing['academic_year'], $existing['semester']) . '. Nothing was changed.');
            }
            if ((int)$existing['period_key'] === $key) {
                throw new RuntimeException(master_period_label($academicYear, $semester) . ' was already imported (' . strtolower($existing['status']) . '). Imported lists are never overwritten.');
            }
        }
        $latest = $imports ? end($imports) : null;
        if ($latest && (int)$latest['period_key'] > $key) {
            throw new RuntimeException('A newer list already exists (' . master_period_label($latest['academic_year'], $latest['semester']) . '). Importing an older semester is not supported, so no wrong records are archived.');
        }
        // Keep every semester of the current academic year active; archive prior academic years.
        $toArchive = master_imports_to_archive($imports, $academicYear);
        $plan = [
            'period' => master_period_label($academicYear, $semester), 'rows' => count($records), 'counts' => $counts, 'skipped' => $skipped, 'invalid' => $invalid,
            'will_archive' => array_map(fn($i) => ['id' => (int)$i['id'], 'label' => master_period_label($i['academic_year'], $i['semester'])], $toArchive),
        ];
        if ($dryRun) { $pdo->commit(); return $plan + ['saved' => false]; }

        $now = date('Y-m-d H:i:s');
        query('INSERT INTO master_list_imports (academic_year, semester, period_key, file_sha256, row_count, status, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, \'ACTIVE\', ?, ?)',
            [$academicYear, $semester, $key, $hash, count($records), $user['id'], $now]);
        $importId = (int)$pdo->lastInsertId();
        foreach (array_chunk($records, 200) as $chunk) {
            $marks = implode(',', array_fill(0, count($chunk), '(?, ?, ?, ?, ?, ?, ?, ?)'));
            $params = [];
            foreach ($chunk as $r) array_push($params, $importId, $r['student_no'], $r['name'], $r['course'], $r['year'], $r['status'], $r['note'], $now);
            $sql = 'INSERT INTO validation_records (import_id, student_no, student_name, course, year_level, validation_status, validation_note, validated_at) VALUES ' . $marks;
            query($sql, $params);
        }
        audit_log('masterlist_import', 'master_list', $importId, null, $user['id'], null, master_period_label($academicYear, $semester), count($records) . ' records.');

        foreach ($toArchive as $old) {
            $changed = query("UPDATE master_list_imports SET status = 'ARCHIVED', archived_at = ?, archived_by = ?, archive_note = ? WHERE id = ? AND status = 'ACTIVE'",
                [$now, $user['id'], 'Archived when ' . master_period_label($academicYear, $semester) . ' was imported.', $old['id']])->rowCount();
            if ($changed) audit_log('masterlist_archive', 'master_list', (int)$old['id'], null, $user['id'], 'ACTIVE', 'ARCHIVED', 'Archived by the import of ' . master_period_label($academicYear, $semester) . '.');
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;      // nothing was saved: not the import, not the archiving
    }
    return $plan + ['saved' => true, 'import_id' => $importId];
}

// Search the records (active and archived). Filters: academic_year, semester, student_no, name, status, scope (active|archived|all), archived_from, archived_to.
function search_validation_records($filters, $page, $perPage = 25) {
    $where = []; $params = [];
    $scope = $filters['scope'] ?? 'all';
    if ($scope === 'active') $where[] = "m.status = 'ACTIVE'";
    elseif ($scope === 'archived') $where[] = "m.status = 'ARCHIVED'";
    if (($filters['academic_year'] ?? '') !== '') { $where[] = 'm.academic_year = ?'; $params[] = $filters['academic_year']; }
    if ((int)($filters['semester'] ?? 0) > 0) { $where[] = 'm.semester = ?'; $params[] = (int)$filters['semester']; }
    if (($filters['student_no'] ?? '') !== '') { $where[] = 'v.student_no LIKE ?'; $params[] = '%' . $filters['student_no'] . '%'; }
    if (($filters['name'] ?? '') !== '') { $where[] = 'v.student_name LIKE ?'; $params[] = '%' . $filters['name'] . '%'; }
    if (in_array($filters['status'] ?? '', ['VALIDATED', 'MISMATCH', 'NOT_REGISTERED', 'INVALID'], true)) { $where[] = 'v.validation_status = ?'; $params[] = $filters['status']; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $filters['archived_from'] ?? '')) { $where[] = 'm.archived_at >= ?'; $params[] = $filters['archived_from'] . ' 00:00:00'; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $filters['archived_to'] ?? '')) { $where[] = 'm.archived_at <= ?'; $params[] = $filters['archived_to'] . ' 23:59:59'; }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $from = 'FROM validation_records v JOIN master_list_imports m ON m.id = v.import_id';
    $total = (int)fetch_one("SELECT COUNT(*) AS c $from $whereSql", $params)['c'];
    $page = max(1, (int)$page);
    $offset = ($page - 1) * $perPage;
    $rows = fetch_all("SELECT v.id, v.student_no, v.student_name, v.course, v.year_level, v.validation_status, v.validation_note, v.validated_at,
                              m.academic_year, m.semester, m.status AS list_status, m.archived_at
                       $from $whereSql ORDER BY m.period_key DESC, v.student_name ASC, v.id ASC LIMIT $perPage OFFSET $offset", $params);
    foreach ($rows as &$row) $row['semester_label'] = SEMESTER_LABELS[(int)$row['semester']] ?? '';
    return ['records' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage];
}

// ---- Per-student view of the validation records (Admin > Students, and the student's own My Profile) ----

// Every validation record of ONE student, newest semester first. Active and archived lists are both included; nothing is changed.
function student_validation_history($studentNo) {
    $studentNo = trim((string)$studentNo);
    if ($studentNo === '') return [];
    $rows = fetch_all('SELECT v.student_no, v.student_name, v.course, v.year_level, v.validation_status, v.validation_note, v.validated_at,
                              m.academic_year, m.semester, m.status AS list_status, m.archived_at
                       FROM validation_records v JOIN master_list_imports m ON m.id = v.import_id
                       WHERE v.student_no = ? ORDER BY m.period_key DESC, v.id DESC', [$studentNo]);
    foreach ($rows as &$row) {
        $row['semester_label'] = SEMESTER_LABELS[(int)$row['semester']] ?? '';
        $row['period_label'] = master_period_label($row['academic_year'], $row['semester']);
    }
    return $rows;
}

// The newest validation record of each given student number (one query for the whole page of the Students list).
// Returns [lowercase student_no => record]. Students that are on no master list yet are simply missing.
function latest_validation_for_students(array $studentNos) {
    $studentNos = array_values(array_unique(array_filter(array_map(fn($n) => trim((string)$n), $studentNos), fn($n) => $n !== '')));
    if (!$studentNos) return [];
    $marks = implode(',', array_fill(0, count($studentNos), '?'));
    $rows = fetch_all("SELECT v.student_no, v.validation_status, v.validation_note, m.academic_year, m.semester, m.status AS list_status
                       FROM validation_records v JOIN master_list_imports m ON m.id = v.import_id
                       WHERE v.student_no IN ($marks) ORDER BY m.period_key DESC, v.id DESC", $studentNos);
    $latest = [];
    foreach ($rows as $row) {
        $key = mb_strtolower($row['student_no']);
        if (isset($latest[$key])) continue;                    // the first row of a student is the newest semester
        $row['period_label'] = master_period_label($row['academic_year'], $row['semester']);
        $latest[$key] = $row;
    }
    return $latest;
}