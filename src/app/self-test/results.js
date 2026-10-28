function table(headers,rows){const t=document.createElement('table'),head=document.createElement('tr');for(const h of headers){const th=document.createElement('th');th.textContent=h;head.appendChild(th);}t.appendChild(head);for(const row of rows){const tr=document.createElement('tr');for(const cell of row){const td=document.createElement('td');td.textContent=cell;tr.appendChild(td);}t.appendChild(tr);}return t;}
function readIntake(){
  const value=id=>$(id).value===''?null:$(id).value==='yes';
  return {adult:value('adult'),sudden:value('sudden'),earSymptoms:value('earSymptoms'),difficulty:value('difficulty'),reviewed:$('intakeReviewed').checked};
}
function checkIntake(){
  const decision=C.intakeDecision(readIntake());
  $('intakeMessage').textContent=decision.message;
  if(!decision.allowed)$('intakeMessage').scrollIntoView({behavior:'smooth',block:'center'});
  return decision.allowed;
}
for(const field of $('intakePanel').querySelectorAll('input,select'))field.addEventListener('change',()=>{$('intakeMessage').textContent=C.intakeDecision(readIntake()).message;});
$('intakeMessage').textContent='Hãy trả lời đầy đủ trước khi bắt đầu. Nếu nghe giảm đột ngột, hãy đi khám ngay.';
function renderWhoReport(s){
  const box=$('whoResult');box.replaceChildren();box.hidden=s.type!=='tone';if(box.hidden)return;
  const r=C.whoReport(s),add=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;box.appendChild(node);return node;};
  add('h3','Tham chiếu phân mức WHO 2021');
  if(!r.eligible){
    add('p','Chưa đủ điều kiện phân mức nghe kém.');
    const list=add('ul','');for(const reason of r.blockers){const item=document.createElement('li');item.textContent=reason;list.appendChild(item);}
  }else{
    const fmt=v=>v.toLocaleString('vi-VN',{maximumFractionDigits:3});
    box.appendChild(table(['Chỉ số','Giá trị'],[['PTA4 tai trái',fmt(r.pta4.L)+' dB HL'],['PTA4 tai phải',fmt(r.pta4.R)+' dB HL'],['Tai nghe tốt hơn',r.betterEar==='equal'?'Hai tai bằng nhau':r.betterEar==='L'?'Trái':'Phải'],['Phân mức theo tai tốt hơn',r.grade.label],['Tiêu chí nghe kém một bên WHO',r.unilateral?'Có dấu hiệu: tai tốt <20 và tai còn lại ≥35 dB HL':'Không đạt tiêu chí PTA4 này'] ]));
    add('p','PTA4 = trung bình ngưỡng 500, 1.000, 2.000, 4.000 Hz. Chỉ dùng lần đo chính; không làm tròn trước khi phân mức. “Bình thường theo PTA4” không có nghĩa mọi tần số và cả hai tai đều bình thường.');
    add('p','Đây là phân mức tham chiếu từ ngưỡng sàng lọc chưa có che lấp tai đối bên; chưa xác định kiểu mất thính lực. Bước đo 5 dB và sai số thiết bị có thể làm thay đổi nhóm khi kết quả gần ranh giới.');
  }
  add('p',r.recommendation).className='notice';
  const details=add('details',''),summary=document.createElement('summary');summary.textContent='Bảng phân mức và phạm vi áp dụng';details.appendChild(summary);
  details.appendChild(table(['PTA4 tai tốt hơn (dB HL)','Phân mức'],C.WHO_GRADES.map(g=>[g.min===null?'< 20':g.max===null?'≥ 95':g.min+' đến < '+g.max,g.label])));
  const note=document.createElement('p');note.textContent='Các bước kiểm tra chất lượng, giới hạn tuổi và điều kiện chặn của ứng dụng là lựa chọn triển khai thận trọng; không phải chứng nhận hoặc quy trình được WHO thẩm định. Thông tin môi trường do người dùng nhập chưa được xác minh độc lập.';details.appendChild(note);
  const link=document.createElement('a');link.href=C.WHO_SOURCE;link.target='_blank';link.rel='noopener';link.textContent='Nguồn: WHO World report on hearing (2021), bảng 1.3';details.appendChild(link);
}
function levelText(r,hlMode){if(hlMode){const v=r.hl===null||r.hl===undefined?null:String(Math.round(r.hl*10)/10);if(v===null)return 'Chưa xác định';if(r.kind==='estimate')return v;if(r.kind==='below_range')return '≤ '+v;if(r.kind==='above_range')return '> '+v;return 'Chưa xác định';}if(r.kind==='estimate')return r.level.toFixed(1);if(r.kind==='below_range')return '≤ '+r.level;if(r.kind==='above_range')return '> '+r.level;return 'Chưa xác định';}
function intervalText(r,hlMode){const u=hlMode?r.uncertaintyHL:r.uncertainty;return u&&Number.isFinite(u.lower)&&Number.isFinite(u.upper)?`${u.lower.toFixed(1)} … ${u.upper.toFixed(1)} ${hlMode?'dB HL':'dBFS'}`:'—';}
function stopReasonText(r){return {'insufficient-level-dependent-evidence':'Chưa phân biệt được phản hồi theo mức âm với trả lời ngẫu nhiên','credible-interval-and-response-bracket':'Khoảng 95%, bằng chứng phản hồi và độ phù hợp mô hình đạt','posterior-and-repeated-floor-responses':'Nghe lặp lại tại sàn; ngưỡng dưới dải','posterior-and-repeated-ceiling-misses':'Không nghe lặp lại tại trần; ngưỡng trên dải','maximum-trials-without-required-evidence':'Hết lượt nhưng chưa đủ bằng chứng'}[r.stopReason]||r.stopReason||({estimate:'Đủ phản hồi xác nhận',below_range:'Dưới dải phát',above_range:'Trên dải phát',inconclusive:'Chưa xác định'}[r.kind]);}
function showResult(s){displayed=s;$('result').hidden=false;$('resultTitle').textContent=s.type==='tone'?(s.calibrated?'Kết quả sàng lọc âm đơn · dB HL':'Kết quả mức nghe tương đối · dBFS'):'Kết quả nghe lời nói trong nhiễu';const status={completed:'Hoàn thành',stopped:'Đã dừng sớm',interrupted:'Phiên bị gián đoạn',in_progress:'Đang đo'}[s.status]||s.status;$('resultTable').replaceChildren();$('chart').replaceChildren();renderWhoReport(s);if(s.type==='tone'){const experimental=C.isExperimentalTone(s),q=C.assessToneQuality(s.results,s.trials,s.config?.ears),retest=Object.values(q.retests||{}),retestText=retest.length?retest.map(r=>`${r.difference} dB`).join(', '):'chưa đủ',quality=q.reliable?'Kiểm tra phản hồi nội bộ đạt':'CẦN ĐO LẠI / kiểm tra điều kiện';$('resultSummary').textContent=`${status} · ${experimental?'Bayesian/Active Learning · NGHIÊN CỨU. ':''}${quality}. Lượt im lặng: ${q.falsePositives}/${q.catches} báo nghe; chênh đo lại 1.000 Hz: ${retestText}. ${s.results.length} điểm đã kết thúc. ${experimental?'Khoảng hậu nghiệm 95% chỉ phản ánh mô hình; chưa bao gồm sai số hiệu chuẩn và không phải chứng nhận độ chính xác. ':''}${s.calibrated?`Đơn vị dB HL theo hồ sơ “${s.calibration.profile.transducer}” (hạn ${new Date(s.calibration.profile.expiresAt).toLocaleDateString('vi-VN')}); chỉ đúng với đúng thiết bị và âm lượng lúc hiệu chuẩn, là sàng lọc, không thay chẩn đoán.`:'Đơn vị dBFS đỉnh, chưa hiệu chuẩn; không quy đổi sang dB HL.'}`;$('resultTable').appendChild(table(['Tai','Hz','Lần đo',s.calibrated?'Ngưỡng (dB HL)':'Mức tương đối (dBFS)','Số lượt','Khoảng mô hình 95%','Lý do dừng'],s.results.map(r=>[r.ear==='L'?'Trái':'Phải',r.freq,r.phase==='retest'?'Kiểm tra lại':'Chính',levelText(r,s.calibrated),r.trials,intervalText(r,s.calibrated),stopReasonText(r)])));drawChart(s.results,s.calibrated);}else{const n=s.trials.length,correct=s.trials.filter(t=>t.correct).length;$('resultSummary').textContent=`${status} · Đúng ${correct}/${n} câu${n?' ('+Math.round(correct/n*100)+'%)':''}. SNR thay đổi giữa các câu; điểm này chưa phải ngưỡng SRT hay audiogram.`;$('resultTable').appendChild(table(['Câu','SNR (dB)','Kết quả'],s.results.map(r=>[r.sentence,r.snr,r.correct?'Đúng':'Sai'])));} $('result').scrollIntoView({behavior:'smooth'});}
function drawChart(results,hlMode){
 const primary=results.filter(r=>r.phase==='primary'),val=r=>hlMode?r.hl:r.level,interval=r=>hlMode?r.uncertaintyHL:r.uncertainty;
 const values=primary.flatMap(r=>[val(r),interval(r)?.lower,interval(r)?.upper]).filter(Number.isFinite);
 const lo=Math.floor(Math.min(hlMode?-10:C.MIN,...values)/10)*10,hi=Math.ceil(Math.max(hlMode?60:C.MAX,...values)/10)*10;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 360');svg.setAttribute('role','img');
 svg.setAttribute('aria-label','Biểu đồ mức nghe: X xanh tai trái, O đỏ tai phải; thanh dọc là khoảng bất định theo mô hình. Chi tiết trong bảng bên dưới.');
 const el=(name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.appendChild(n);return n;};
 const x=f=>85+Math.log2(f/250)/5*580,y=l=>40+(l-lo)/(hi-lo)*230;
 for(let db=lo;db<=hi;db+=10){el('line',{x1:85,x2:665,y1:y(db),y2:y(db),stroke:'#dde4d9'});el('text',{x:72,y:y(db)+5,'text-anchor':'end',fill:'#59675d','font-size':12},db);}
 for(const f of FREQS){el('line',{x1:x(f),x2:x(f),y1:40,y2:270,stroke:'#e8ede5'});el('text',{x:x(f),y:294,'text-anchor':'middle','font-size':12},f);}
 el('text',{x:85,y:20,'font-size':13},hlMode?'dB HL · nghe kém hơn xuống dưới':'dBFS đỉnh · mức tín hiệu tăng xuống dưới');
 for(const ear of ['L','R']){
  const color=ear==='L'?'#3269a8':'#b65035';let prev=null;
  for(const f of FREQS){
   const r=primary.find(r=>r.ear===ear&&r.freq===f);if(!r){prev=null;continue;}
   const u=interval(r),xx=x(f)+(ear==='L'?-3:3);
   if(u&&Number.isFinite(u.lower)&&Number.isFinite(u.upper)){
    el('line',{x1:xx,x2:xx,y1:y(u.lower),y2:y(u.upper),stroke:color,'stroke-width':5,opacity:.25});
    for(const edge of [u.lower,u.upper])el('line',{x1:xx-5,x2:xx+5,y1:y(edge),y2:y(edge),stroke:color,opacity:.65});
   }
   if(r.kind!=='estimate'||!Number.isFinite(val(r))){
    prev=null;if(Number.isFinite(val(r)))el('text',{x:xx,y:y(val(r))+5,fill:color,'text-anchor':'middle','font-size':20},r.kind==='above_range'?'↓':'↑');continue;
   }
   if(prev)el('line',{x1:x(prev.freq),x2:x(f),y1:y(val(prev)),y2:y(val(r)),stroke:color,'stroke-width':1.5});
   if(ear==='R')el('circle',{cx:xx,cy:y(val(r)),r:5,fill:'white',stroke:color,'stroke-width':2});
   else for(const sign of [-1,1])el('line',{x1:xx-5,x2:xx+5,y1:y(val(r))-sign*5,y2:y(val(r))+sign*5,stroke:color,'stroke-width':2});
   prev=r;
  }
 }
 el('text',{x:90,y:322,fill:'#3269a8','font-size':13},'X Tai trái');el('text',{x:195,y:322,fill:'#b65035','font-size':13},'O Tai phải');
 el('text',{x:310,y:322,'font-size':12},'↑ / ↓: ngoài dải · không phải ngưỡng xác định');
 el('text',{x:90,y:346,'font-size':12},'Thanh dọc: khoảng hậu nghiệm 95% theo mô hình; không bao gồm sai số hiệu chuẩn.');
 $('chart').appendChild(svg);
}
