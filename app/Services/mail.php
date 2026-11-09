<?php
function send_mail(string $to, string $subject, string $text): bool {
  if(cfg('mail_enabled')) return @mail($to,$subject,$text,"From: ".cfg('mail_from')."\r\nContent-Type: text/plain; charset=utf-8");
  log_line('mail.log',"TO:$to SUBJECT:$subject\n$text\n---"); return true;
}
/** Sends an event email once per request. Failure never changes request state. */
function mail_once(int $rid, string $event, string $to, string $subject, string $text): void {
  try {
    $st=q("INSERT IGNORE INTO email_log(request_id,event,to_email,subject) VALUES(?,?,?,?)",[$rid,$event,$to,$subject]);
    if($st->rowCount()===0) return;
    $ok=send_mail($to,$subject,$text);
    q("UPDATE email_log SET ok=? WHERE request_id=? AND event=?",[$ok?1:0,$rid,$event]);
  } catch(Throwable $e){ log_line('app.log','mail_once: '.$e->getMessage()); }
}
