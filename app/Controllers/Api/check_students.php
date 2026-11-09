<?php
require_once __DIR__ . '/../../Models/students.php';
register_error_handlers();
require_method('POST');

function student_id_lookup_rate_limit($bucket, $limit, $windowSeconds) {
    $path = __DIR__ . '/../../../storage/.student_id_lookup_limits.json';
    $handle = fopen($path, 'c+');
    if ($handle === false) throw new RuntimeException('Could not open the Student ID lookup rate-limit store.');
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        throw new RuntimeException('Could not lock the Student ID lookup rate-limit store.');
    }

    try {
        rewind($handle);
        $contents = stream_get_contents($handle);
        $limits = $contents === '' ? [] : json_decode($contents, true);
        if (!is_array($limits)) throw new RuntimeException('The Student ID lookup rate-limit store is invalid.');

        $now = time();
        foreach ($limits as $key => $hits) {
            if (!is_array($hits)) {
                unset($limits[$key]);
                continue;
            }
            $hits = array_values(array_filter($hits, fn($time) => is_int($time) && $time > $now - 900));
            if ($hits) $limits[$key] = $hits;
            else unset($limits[$key]);
        }

        $events = $limits[$bucket] ?? [];
        if (!is_array($events)) $events = [];
        $events = array_values(array_filter($events, fn($time) => is_int($time) && $time > $now - $windowSeconds));
        $allowed = count($events) < $limit;
        if ($allowed) $events[] = $now;
        $limits[$bucket] = $events;

        rewind($handle);
        if (!ftruncate($handle, 0)) throw new RuntimeException('Could not update the Student ID lookup rate-limit store.');
        $written = fwrite($handle, json_encode($limits));
        if ($written === false || !fflush($handle)) throw new RuntimeException('Could not update the Student ID lookup rate-limit store.');
        return $allowed;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

$in = read_json_body();
$studentId = trim((string)($in['student_id'] ?? ''));
if (!preg_match('/^[0-9-]{3,30}$/', $studentId)) {
    fail('Enter a valid Student ID.', 422);
}

$ip = request_ip();
if (!student_id_lookup_rate_limit(hash('sha256', 'ip|' . $ip), 40, 900)) {
    fail('Too many Student ID checks. Please wait before trying again.', 429);
}

$student = lookup_registered_student_by_id($studentId);
if (!$student) {
    fail('We could not verify this Student ID. Check it or contact the Registrar.', 404);
}

json_response(['ok' => true, 'student' => $student]);
