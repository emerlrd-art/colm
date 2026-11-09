let ME,DOCS=[],WZ={sel:{},checks:{}};
const pages={
async home(){const j=await get('requests.php');$('#main').innerHTML=`<div class=card><h2>My requests</h2><table><tr><th>Tracking</th><th>Items</th><th>Status</th><th>Release</th><th></th></tr>${j.requests.map(r=>`<tr><td>${esc(r.tracking_no)}</td><td>${r.items}</td><td>${badge(r.status)}</td><td>${esc(r.release_date||'—')}</td><td><button class="btn sm" data-id=${r.id}>Open</button></td></tr>`).join('')||'<tr><td colspan=5 class=mut>No requests yet.</td></tr>'}</table></div>`;
  $('#main').querySelectorAll('[data-id]').forEach(b=>b.onclick=run(()=>detail(b.dataset.id)))},
async new(){DOCS=(await get('documents.php')).documents;WZ={sel:{},checks:{}};
  $('#main').innerHTML=`<div class=card><h2>1. Choose documents</h2><div id=cat>${DOCS.map(d=>`<div class=row style="padding:8px 0;border-bottom:1px solid var(--bd)"><input type=checkbox style="width:auto" data-d=${d.id}><div style="flex:1"><b>${esc(d.name)}</b> <span class=mut>${money(d.price)} · ${d.processing_days}d</span></div><input type=number min=1 max=10 value=1 style="width:70px" data-q=${d.id}><select style="width:120px" data-f=${d.id}>${d.formats.map(f=>`<option>${f}</option>`).join('')}</select></div>`).join('')}</div><p><button class=btn id=next>Continue to uploads</button></p></div><div id=step2></div>`;
  $('#next').onclick=run(async()=>{const sel=DOCS.filter(d=>$(`[data-d="${d.id}"]`).checked);if(!sel.length)throw new Error('Select at least one document');
    WZ.sel=sel.map(d=>({document_id:d.id,quantity:+$(`[data-q="${d.id}"]`).value,format:$(`[data-f="${d.id}"]`).value}));
    const reqs={};sel.forEach(d=>d.requirements.forEach(r=>reqs[r.id]=r.label+' ('+d.name+')'));WZ.checks={};
    $('#step2').innerHTML=`<div class=card><h2>2. Upload requirements</h2><p class=mut>PDF, JPG or PNG up to 5 MB. Each file is pre-checked; registrars make the final decision.</p>${Object.entries(reqs).map(([id,l])=>`<div style="margin:10px 0"><label>${esc(l)}</label><input type=file data-r=${id} accept=".pdf,.jpg,.jpeg,.png"><div class=bar><i id=pg${id}></i></div><div class=mut id=st${id}>Not uploaded</div></div>`).join('')||'<p class=mut>No uploads required.</p>'}<p><button class=btn id=sub>3. Submit request</button></p></div>`;
    $('#step2').querySelectorAll('[data-r]').forEach(i=>i.onchange=run(async()=>{const id=i.dataset.r,f=i.files[0];if(!f)return;const fd=new FormData();fd.append('requirement_id',id);fd.append('file',f);delete WZ.checks[id];$('#st'+id).textContent='Checking…';
      const r=await upload('verify.php',fd,p=>$('#pg'+id).style.width=p*100+'%');
      if(r.status==='accepted'){WZ.checks[id]=r.id;$('#st'+id).innerHTML='✔ Accepted'+(r.flag?' <span class=mut>(flagged for staff review)</span>':'')}else $('#st'+id).innerHTML='✘ Declined: '+esc(r.reason)}));
    $('#sub').onclick=run(async()=>{const j=await post('requests.php',{action:'create',items:WZ.sel,check_ids:Object.values(WZ.checks)});toast('Submitted: '+j.tracking_no);show('home')})})},
async notes(){const j=await get('notifications.php');$('#main').innerHTML=`<div class=card><h2>Notifications</h2>${j.notifications.map(n=>`<p style="${n.is_read?'':'font-weight:600'}">${esc(n.message)}<br><span class=mut>${esc(n.created_at)}</span></p>`).join('')||'<p class=mut>Nothing yet.</p>'}</div>`;await post('notifications.php',{});$('#unread').textContent=''},
async prof(){const p=(await get('students.php',{action:'profile'})).profile,v=(await get('masterlist.php',{action:'mine'})).history;
  $('#main').innerHTML=`<div class=card><h2>Profile</h2>${p?`<p><b>${esc(p.full_name)}</b><br>ID ${esc(p.student_no)} · ${esc(p.course||'—')} · ${esc(p.year_level||'')}</p><label>Contact number</label><input id=ct value="${esc(p.contact||'')}"><p><button class=btn id=sv>Save</button></p>`:'<p class=mut>No profile on file.</p>'}</div><div class=card><h2>Validation history</h2><table>${v.map(x=>`<tr><td>${esc(x.period)}</td><td>${esc(x.status)}</td></tr>`).join('')||'<tr><td class=mut>No records.</td></tr>'}</table></div>`;
  const s=$('#sv');if(s)s.onclick=run(async()=>{await post('students.php',{action:'profile',contact:$('#ct').value});toast('Saved')})}
};
async function detail(id){const r=(await get('requests.php',{action:'get',id})).request;const q=await get('qr.php',{id});
  const declined=r.files.filter(f=>f.review_status==='declined');
  const d=modal(`<h2>${esc(r.tracking_no)} ${badge(r.status)}</h2><p class=mut>Release: ${esc(r.release_date||'to be set')} · Total ${money(r.total)} · ${r.paid?'Payment verified':'Payment verification pending'}</p>
  <h3>Documents</h3><table>${r.items.map(i=>`<tr><td>${esc(i.name)}</td><td>×${i.quantity}</td><td>${esc(i.format)}</td></tr>`).join('')}</table>
  <h3>Files</h3><table>${r.files.map(f=>`<tr><td><a href="../api/file.php?id=${f.id}" target=_blank>${esc(f.original_name)}</a><div class=mut>${esc(f.label||'')}</div></td><td>${badge(f.review_status)}<div class=mut>${esc(f.review_note||'')}</div></td></tr>`).join('')}</table>
  ${declined.length?`<h3>Replace declined files</h3>${declined.map(f=>`<label>${esc(f.label)}</label><input type=file data-r=${f.requirement_id}><div class=mut id=rs${f.requirement_id}></div>`).join('')}<p><button class=btn id=rsb>Resubmit</button></p>`:''}
  <h3>Progress</h3>${r.history.map(h=>`<div>${badge(h.status)} <span class=mut>${esc(h.created_at)} ${esc(h.note||'')}</span></div>`).join('')}
  <h3>Tracking QR</h3><div id=qr></div><div class=mut>${esc(q.url)}</div>
  ${r.softcopy_ready?`<p><a class=btn href="../api/softcopy.php?action=download&id=${r.id}" target=_blank>Download softcopy</a> <button class="btn sec sm" id=more>Request more downloads</button><span class=mut> ${r.downloads} used</span></p>`:''}`);
  new QRCode($('#qr',d),{text:q.url,width:140,height:140});
  const m=$('#more',d);if(m)m.onclick=run(async()=>{await post('softcopy.php',{action:'request_more',id:r.id,reason:prompt('Why do you need more downloads?')||''});toast('Request sent')});
  const b=$('#rsb',d);if(b)b.onclick=run(async()=>{const ids=[];for(const i of d.querySelectorAll('[data-r]')){const f=i.files[0];if(!f)throw new Error('Choose a replacement for every declined file');const fd=new FormData();fd.append('requirement_id',i.dataset.r);fd.append('file',f);const v=await upload('verify.php',fd);if(v.status!=='accepted')throw new Error('Declined: '+v.reason);ids.push(v.id)}
    await post('requests.php',{action:'resubmit',id:r.id,check_ids:ids});toast('Resubmitted');d.close();show('home')})}
async function show(p){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));await run(pages[p])()}
(async()=>{const j=await boot();if(!j.user||j.user.role!=='student')return location.href='login.html';ME=j.user;$('#who').textContent=ME.full_name;$('#unread').textContent=j.unread?`(${j.unread})`:'';
  $('#lo').onclick=logout;$('#cpw').onclick=()=>changePasswordDialog(false);document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>show(b.dataset.p));
  if(ME.must_change_password)return changePasswordDialog(true);show('home')})();
