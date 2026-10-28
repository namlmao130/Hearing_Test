// ---------------- Hiệu chuẩn ----------------
const CAL_KEY='hearing-lab-calibration-v1';
let cal=null, calPlan=null, calPlaying=null;
function pointOptions(p){const v=calPlan?calPlan[p.ear][p.freq]:{min:C.MIN,max:C.MAX,initial:-35};return {min:v.min,max:v.max,initial:v.initial};}
function newStair(p){const options=pointOptions(p);return engineMode==='bayesian'?B.create(options):C.staircase(options);}
$('stopCalibration').onclick=()=>{stopSound();resetCalBtn();};
$('toneMethod').onchange=()=>{$('methodHelp').textContent=$('toneMethod').value==='bayesian'?'Bayesian cập nhật xác suất ngưỡng nghe và chọn mức âm để giảm bất định. Khoảng bất định chỉ theo mô hình, chưa gồm sai số hiệu chuẩn. Chế độ nghiên cứu chưa dùng phân mức WHO.':'Tăng 5 dB khi không nghe, giảm 10 dB khi nghe. Giữ phương pháp này làm mốc đối chiếu; phân mức WHO vẫn cần hiệu chuẩn và đủ điều kiện chất lượng.';};
function loadCal(){try{const raw=JSON.parse(localStorage.getItem(CAL_KEY)||'null');if(raw&&typeof raw==='object'&&raw.schemaVersion===1&&raw.measured&&raw.retspl)cal=raw;}catch(e){warn('Không đọc được hồ sơ hiệu chuẩn đã lưu.');}}
function persistCal(){try{if(cal)localStorage.setItem(CAL_KEY,JSON.stringify(cal));else localStorage.removeItem(CAL_KEY);return true;}catch(e){warn('Chưa lưu được hồ sơ hiệu chuẩn vào trình duyệt. Hãy tải JSON để giữ bản sao.');return false;}}
function envInfo(){if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();return{sampleRate:ctx.sampleRate,userAgent:navigator.userAgent};}
function buildCalTable(){
 const t=$('calTable');t.replaceChildren();
 const head=document.createElement('tr');
 for(const h of ['Hz','RETSPL (dB SPL)','Tai trái','SPL đo (dB)','Tai phải','SPL đo (dB)','Offset T / P (dB)','Dải đo T / P (dB HL)']){const th=document.createElement('th');th.textContent=h;head.appendChild(th);}
 t.appendChild(head);
 for(const f of C.FREQS){
  const row=document.createElement('tr'),cell=()=>{const c=document.createElement('td');row.appendChild(c);return c;};
  const num=(id,label)=>{const i=document.createElement('input');i.type='number';i.step='0.1';i.id=id;i.setAttribute('aria-label',label);i.oninput=refreshCal;return i;};
  const play=(ear)=>{const b=document.createElement('button');b.type='button';b.textContent='▶';b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',`Phát âm hiệu chuẩn tai ${ear==='L'?'trái':'phải'} ${f} Hz`);b.onclick=()=>toggleCalTone(f,ear,b);return b;};
  cell().textContent=f;
  cell().appendChild(num('rs-'+f,`RETSPL ${f} Hz`));
  cell().appendChild(play('L'));cell().appendChild(num(`m-L-${f}`,`SPL đo tai trái ${f} Hz`));
  cell().appendChild(play('R'));cell().appendChild(num(`m-R-${f}`,`SPL đo tai phải ${f} Hz`));
  const off=cell(),rng=cell();off.id='off-'+f;rng.id='rng-'+f;off.className=rng.className='num';
  t.appendChild(row);
 }
}
function fillCal(){
 const c=cal||{};
 $('calTransducer').value=c.transducer||'';$('calMeter').value=c.meter||'';$('calSource').value=c.retsplSource||'';$('calOperator').value=c.operator||'';
 $('calDate').value=c.date||new Date().toISOString().slice(0,10);$('calMonths').value=c.validityMonths||12;
 for(const f of C.FREQS){$('rs-'+f).value=c.retspl&&c.retspl[f]!==undefined?c.retspl[f]:'';for(const ear of ['L','R'])$(`m-${ear}-${f}`).value=c.measured&&c.measured[ear]&&c.measured[ear][f]!==undefined?c.measured[ear][f]:'';}
 refreshCal();
}
function readProfile(){
 const measured={L:{},R:{}},retspl={};
 for(const f of C.FREQS){retspl[f]=$('rs-'+f).value;for(const ear of ['L','R'])measured[ear][f]=$(`m-${ear}-${f}`).value;}
 const date=$('calDate').value,months=Math.max(1,Math.min(24,parseInt($('calMonths').value,10)||12));
  let expiresAt='';if(date){const d=new Date(date+'T00:00:00');d.setMonth(d.getMonth()+months);expiresAt=d.toISOString();}
  if(cal && cal.date===date && (cal.validityMonths||12)===months && cal.expiresAt)expiresAt=cal.expiresAt;
 return{schemaVersion:1,transducer:$('calTransducer').value.trim(),meter:$('calMeter').value.trim(),operator:$('calOperator').value.trim(),retsplSource:$('calSource').value.trim(),date,validityMonths:months,expiresAt,measured,retspl,env:cal&&cal.env?cal.env:null};
}
function profileProblems(p){
 return C.validateCalibration(p).problems;
}
function refreshCal(){
 const p=readProfile();
 for(const f of C.FREQS){
  const ok=ear=>p.measured[ear][f]!==''&&p.retspl[f]!==''&&Number.isFinite(Number(p.measured[ear][f]))&&Number.isFinite(Number(p.retspl[f]));
  const pl=ear=>ok(ear)?C.pointPlan(p.measured[ear][f],p.retspl[f]):null,L=pl('L'),R=pl('R');
  $('off-'+f).textContent=`${L?L.offset:'–'} / ${R?R.offset:'–'}`;
  $('rng-'+f).textContent=`${L?L.minHL+'…'+L.maxHL:'–'} / ${R?R.minHL+'…'+R.maxHL:'–'}`;
 }
 const problems=profileProblems(p),box=$('calMessages');box.replaceChildren();
 const add=t=>{const li=document.createElement('li');li.textContent=t;box.appendChild(li);};
 if(problems.length){box.className='';for(const t of problems.slice(0,8))add(t);if(problems.length>8)add(`… và ${problems.length-8} mục khác.`);}
 else{box.className='ok';add('Số liệu đủ và hợp lý.');for(const t of C.floorWarnings(C.calibrationPlan(p)).slice(0,8))add('Cảnh báo: '+t);}
}
function updateCalStatus(){
 const v=cal?C.validateCalibration(cal):null,sel=$('useCal'),yes=sel.querySelector('option[value=yes]');
 let text;
 if(!cal)text='Chưa có hồ sơ hiệu chuẩn: kết quả chỉ ở dBFS.';
 else if(v.ok)text=`Hồ sơ hợp lệ: ${cal.transducer}, hết hạn ${new Date(cal.expiresAt).toLocaleDateString('vi-VN')}.`;
 else text=`Hồ sơ chưa dùng được: ${v.problems[0]}`;
 $('calStatus').textContent=text;yes.disabled=!(v&&v.ok);if(yes.disabled)sel.value='no';
}
function calGate(ears){
 const v=C.validateCalibration(cal);
 if(!v.ok)return{ok:false,message:'Hồ sơ hiệu chuẩn chưa dùng được:\n'+v.problems.slice(0,5).join('\n')};
 if(!$('calSame').checked)return{ok:false,message:'Hãy xác nhận bạn dùng đúng tai nghe, thiết bị, trình duyệt và mức âm lượng hệ thống như lúc hiệu chuẩn.'};
 const issues=C.environmentMatches(cal,envInfo());
 if(issues.length)return{ok:false,message:'Điều kiện khác lúc hiệu chuẩn:\n'+issues.join('\n')+'\nHãy hiệu chuẩn lại trên thiết lập này.'};
 const plan=C.calibrationPlan(cal);
 if(ears.some(ear=>C.FREQS.some(f=>!plan[ear][f].usable)))return{ok:false,message:'Có tần số không còn khoảng mức phát khả dụng:\n'+C.floorWarnings(plan,ears).filter(x=>x.includes('khả dụng')).slice(0,4).join('\n')};
 const w=C.floorWarnings(plan,ears);
 if(w.length&&!confirm('Dải đo bị giới hạn:\n'+w.slice(0,4).join('\n')+'\n\nTiếp tục với giới hạn này?'))return{ok:false,message:'Đã hủy. Hãy chỉnh âm lượng và hiệu chuẩn lại.'};
 return{ok:true,plan};
}
async function toggleCalTone(f,ear,btn){
 if(session||busy)return;
 if(!$('calCoupler').checked){$('calToneStatus').textContent='Hãy xác nhận tai nghe đã đặt trên coupler, không đeo vào tai.';return;}
 if(calPlaying&&calPlaying.f===f&&calPlaying.ear===ear){stopCalTone();return;}
 stopCalTone();
 busy=true;const token=epoch;
 try{
  await audio();
  if(token!==epoch)return;
  const source=ctx.createOscillator(),gain=ctx.createGain();source.frequency.value=f;source.connect(gain);
  const merger=route(gain,ear),now=ctx.currentTime,amp=10**(C.CAL_REF/20);
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(amp,now+.05);
  activeNodes.push(source);calPlaying={f,ear,btn,source,gain};
  btn.textContent='■';btn.setAttribute('aria-pressed','true');
  $('calToneStatus').textContent=`Đang phát ${f} Hz, tai ${ear==='L'?'trái':'phải'}, ${C.CAL_REF} dBFS đỉnh. Tự dừng sau 10 giây.`;
  source.onended=()=>{try{gain.disconnect();merger.disconnect();}catch{}activeNodes=activeNodes.filter(n=>n!==source);if(calPlaying&&calPlaying.source===source)resetCalBtn();};
  source.start(now);source.stop(now+10);
 }catch(e){if(token===epoch)warn(e.message);}finally{if(token===epoch)busy=false;}
}
function stopCalTone(){if(!calPlaying)return;const{source,gain}=calPlaying;try{const t=ctx.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setValueAtTime(gain.gain.value,t);gain.gain.linearRampToValueAtTime(0,t+.03);source.stop(t+.04);}catch{}}
function resetCalBtn(){if(!calPlaying)return;calPlaying.btn.textContent='▶';calPlaying.btn.setAttribute('aria-pressed','false');calPlaying=null;$('calToneStatus').textContent='';}
$('calSave').onclick=()=>{
 const p=readProfile();
 if($('calRemeasured').checked)p.env=envInfo();
 const problems=profileProblems(p);
 if(problems.length){$('calToneStatus').textContent='Chưa lưu hồ sơ: '+problems.slice(0,4).join(' ');return;}
 p.savedAt=new Date().toISOString();cal=p;const stored=persistCal();$('calRemeasured').checked=false;updateCalStatus();refreshCal();
 $('calToneStatus').textContent=stored?'Đã lưu hồ sơ. Môi trường gốc được giữ nguyên nếu chưa xác nhận đo lại.':'Hồ sơ chỉ có trong phiên hiện tại. Hãy tải JSON để giữ bản sao.';
};
$('calExport').onclick=()=>{const p=readProfile();p.env=cal&&cal.env?cal.env:null;download({type:'calibration',id:p.date||'profile',...p});};
$('calDelete').onclick=()=>{if(!cal&&!$('calTransducer').value)return;if(!confirm('Xóa hồ sơ hiệu chuẩn trên trình duyệt này? Các phiên đã đo giữ nguyên bản sao hồ sơ của chúng.'))return;stopCalTone();cal=null;persistCal();fillCal();updateCalStatus();};
$('calImport').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 try{
  if(file.size>200*1024)throw Error('File quá lớn cho hồ sơ hiệu chuẩn.');
  const raw=JSON.parse(await file.text());
  if(!raw||typeof raw!=='object'||!raw.measured||!raw.retspl)throw Error('File không phải hồ sơ hiệu chuẩn.');
  const keep=['transducer','meter','operator','retsplSource','date','validityMonths','expiresAt','measured','retspl','env'],p={schemaVersion:1};
  for(const k of keep)if(raw[k]!==undefined)p[k]=raw[k];
   const validation=C.validateCalibration(p);if(!validation.ok)throw Error(validation.problems.slice(0,4).join(' '));
   cal=p;$('calRemeasured').checked=false;fillCal();updateCalStatus();$('calToneStatus').textContent='Đã nhập hồ sơ vào phiên hiện tại. Môi trường hiệu chuẩn gốc được giữ nguyên. Bấm Lưu hồ sơ để lưu lâu dài.';
 }catch(err){$('calToneStatus').textContent='Không nhập được: '+err.message;}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCalTone();});window.addEventListener('pagehide',stopCalTone);
buildCalTable();loadCal();fillCal();updateCalStatus();
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});window.addEventListener('pagehide',()=>{pausePlayback();if(session)save();});window.addEventListener('beforeunload',e=>{if(session){e.preventDefault();e.returnValue='';}});
