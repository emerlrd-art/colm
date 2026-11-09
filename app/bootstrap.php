<?php
declare(strict_types=1);
require __DIR__.'/Utils/helpers.php'; require __DIR__.'/Models/database.php'; require __DIR__.'/Middleware/auth.php';
require __DIR__.'/Services/mail.php'; require __DIR__.'/Services/files.php'; require __DIR__.'/Services/release.php'; require __DIR__.'/Models/workflow.php';
set_exception_handler(function(Throwable $e){ log_line('app.log',$e->getMessage().' @'.$e->getFile().':'.$e->getLine()); if(!headers_sent()){ http_response_code(500); header('Content-Type: application/json'); } echo json_encode(['ok'=>false,'error'=>'Server error']); });
if(PHP_SAPI!=='cli') boot_session();
