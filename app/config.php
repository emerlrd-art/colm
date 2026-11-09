<?php
return [
 'db_dsn'=>getenv('COLM_DB_DSN')?:'mysql:host=127.0.0.1;dbname=colm;charset=utf8mb4',
 'db_user'=>getenv('COLM_DB_USER')?:'root',
 'db_pass'=>getenv('COLM_DB_PASS')?:'',
 // Production: point this OUTSIDE the web root
 'upload_dir'=>getenv('COLM_UPLOAD_DIR')?:__DIR__.'/../storage/uploads',
 'log_dir'=>__DIR__.'/../storage/logs',
 'max_upload'=>5*1024*1024,
 'softcopy_limit'=>3,
 'claim_grace_days'=>7,
 'ocr'=>getenv('COLM_OCR')?:'off',          // off | tesseract
 'ai_fallback'=>'manual',                   // when OCR unavailable: flag for staff
 'mail_enabled'=>getenv('COLM_MAIL')==='1',  // false = write to storage/logs/mail.log
 'mail_from'=>getenv('COLM_MAIL_FROM')?:'registrar@colm.local',
 'base_url'=>getenv('COLM_BASE_URL')?:'http://localhost:8000',
];
