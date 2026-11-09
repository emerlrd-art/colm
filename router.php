<?php // Dev only: php -S localhost:8000 router.php  (blocks private folders)
$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(preg_match('#^/(app|storage|database|tools|deploy)(/|$)#',$p)){ http_response_code(403); exit('Forbidden'); }
return false;
