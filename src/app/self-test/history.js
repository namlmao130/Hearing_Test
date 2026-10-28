function download(s){const blob=new Blob([JSON.stringify(s.type==='tone'?{...s,interpretation:C.whoReport(s)}:s,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`hearing-${s.type}-${s.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportResult').onclick=()=>displayed&&download(displayed);$('newSession').onclick=()=>{const type=displayed?.type==='speech'?'speech':'tone';setTab(type);window.scrollTo({top:0,behavior:'smooth'});};
function renderHistory(){const box=$('historyList');box.replaceChildren();if(!sessions.length){box.textContent='Chưa có phiên đo được lưu.';return;}for(const s of sessions){const row=document.createElement('div');row.className='history-item';const p=document.createElement('p');p.textContent=`${s.type==='tone'?'Âm đơn':'Lời nói'} · ${new Date(s.startedAt).toLocaleString('vi-VN')} · ${s.trials.length} lượt${C.isExperimentalTone(s)?' · Bayesian nghiên cứu':''}${s.calibrated?' · dB HL':''} · ${{completed:'Hoàn thành',stopped:'Dừng sớm',interrupted:'Gián đoạn',in_progress:'Đang đo'}[s.status]||s.status}`;row.appendChild(p);const actions=document.createElement('div');actions.className='actions';for(const[label,fn]of [['Xem kết quả',()=>showResult(s)],['Tải JSON',()=>download(s)],['Xóa phiên',()=>{if(confirm('Xóa phiên này khỏi lịch sử trình duyệt?')){const previous=sessions;sessions=sessions.filter(x=>x.id!==s.id);if(!persist()){sessions=previous;return;}renderHistory();if(displayed?.id===s.id)$('result').hidden=true;}}]]){const b=document.createElement('button');b.textContent=label;b.onclick=fn;actions.appendChild(b);}row.appendChild(actions);box.appendChild(row);}}
function downloadHistoryText(raw,name){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportHistory').onclick=()=>{downloadHistoryText(JSON.stringify(sessions.map(s=>s.type==='tone'?{...s,interpretation:C.whoReport(s)}:s),null,2),'hearing-history.json');};
$('exportRawHistory').onclick=()=>{const raw=sessionStore.original();if(raw===null){$('historyStatus').textContent='Không có dữ liệu gốc đã đọc được.';return;}downloadHistoryText(raw,'hearing-history-original.json');};
$('importHistory').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||session||busy)return;
 busy=true;const token=epoch;$('importHistory').disabled=true;
 try{
  if(file.size>HearingSessionStore.MAX_BYTES)throw Error('File JSON vượt 10 MB.');
  const raw=await file.text();if(token!==epoch||session)return;
  const merged=HearingSessionStore.merge(sessions,raw),added=merged.length-sessions.length;
  sessions=merged;const stored=persist();renderHistory();
  $('historyStatus').textContent=`Đã khôi phục ${added} phiên${stored?' và lưu trên trình duyệt.':' trong bộ nhớ; chưa lưu được, hãy xuất JSON trước khi đóng trang.'}`;
 }catch(err){if(token===epoch)$('historyStatus').textContent='Không nhập được: '+err.message;}
 finally{if(token===epoch){busy=false;$('importHistory').disabled=false;}}
};
function pausePlayback(){if(!session){stopSound();busy=false;$('importHistory').disabled=false;resetCalBtn();return;}stopSound();waiting=false;busy=false;if(session.type==='tone'){$('heard').disabled=$('notHeard').disabled=true;$('playTone').disabled=false;$('toneStatus').textContent='Âm đã dừng khi rời trang. Bấm phát lại để tiếp tục.';}else if(!$('nextSpeech').hidden){return;}else{pendingSpeech=null;$('answer').disabled=true;$('submitSpeech').disabled=true;$('playSpeech').disabled=false;$('speechStatus').textContent='Âm đã dừng khi rời trang. Bấm phát lại để tiếp tục.';}}
