for(const ear of ['L','R'])$('check'+ear).onclick=async()=>{
 if(busy||session||!checkIntake())return;
 let level=-46;
 if($('useCal').value==='yes'){
  const gate=calGate([ear]);if(!gate.ok){warn(gate.message);return;}
  const plan=gate.plan[ear][1000];level=plan.initial;
 }
 busy=true;const token=epoch;
 try{await tone(1000,level,ear);}catch(e){if(token===epoch)warn(e.message);}finally{if(token===epoch)busy=false;}
};
$('startTone').onclick=()=>{
 if(session||busy||!checkIntake())return;
 if(!$('device').value.trim()){alert('Hãy ghi rõ thiết bị, mẫu tai nghe và mức âm lượng để có thể lặp lại phép đo.');return;}
 if(!$('quiet').checked||!$('ready').checked){alert('Hãy xác nhận môi trường, hai bên tai và âm lượng trước khi bắt đầu.');return;}
 engineMode=$('toneMethod').value;
 if(!['bayesian','staircase'].includes(engineMode)){warn('Phương pháp đo không hợp lệ.');return;}
 if(engineMode==='bayesian'&&!B){warn('Thiếu bayesian-core.js. Hãy giữ các tệp dự án cùng thư mục.');return;}
 stopSound();const ears=$('ears').value==='both'?['L','R']:[$('ears').value];
 points=ears.flatMap(ear=>TONE_ORDER.map(p=>({...p,ear})));pointIndex=0;
 if($('useCal').value==='yes'){const gate=calGate(ears);if(!gate.ok){alert(gate.message);return;}calPlan=gate.plan;}else calPlan=null;
 try{
  const environment=envInfo();stair=newStair(points[0]);
  session=createSession('tone');
  session.engine={id:engineMode,version:engineMode==='bayesian'?B.VERSION:'staircase-5-up-10-down-v1',experimental:engineMode==='bayesian',policy:engineMode==='bayesian'?JSON.parse(JSON.stringify(B.DEFAULTS)):{maxTrials:40}};
  session.algorithm=engineMode==='bayesian'?B.VERSION:'ascending-5dB-down10dB-2-confirmations-with-catch-trials';
  if(calPlan){session.calibrated=true;session.unit='dB_HL';session.calibration={profile:JSON.parse(JSON.stringify(cal)),plan:JSON.parse(JSON.stringify(calPlan)),referenceDbfs:C.CAL_REF,splCapDb:C.SPL_CAP};}
  session.config={frequencies:FREQS,order:TONE_ORDER,ears,toneDurationSeconds:'random 1-2',intervalBeforeToneSeconds:'random 0.6-1.4',procedure:engineMode==='bayesian'?'Independent threshold posterior; expected information gain; fresh prior for 1 kHz retest':'10 dB down / 5 dB up; >=2 ascending responses',environmentConfirmed:true,calibrationSetupConfirmed:!!calPlan&&$('calSame').checked,audioEnvironment:environment,noiseAssessment:{method:$('noiseMethod').value,details:$('noiseDetails').value.trim()},uncalibratedRange:{min:C.MIN,max:C.MAX,initial:-35}};
  catchCountdown=5+Math.floor(Math.random()*4);save();lockTabs(true);
  $('result').hidden=true;$('toneSetup').hidden=true;$('toneRun').hidden=false;
  $('methodBadge').textContent=engineMode==='bayesian'?'Bayesian + Active Learning · nghiên cứu':'Tăng 5 / giảm 10 dB · đối chiếu';renderTone();
 }catch(e){session=null;warn('Chưa bắt đầu: '+e.message);}
};
function renderTone(){
 const p=points[pointIndex],repeat=p.phase==='retest'?' · kiểm tra lại':'';
 $('toneTitle').textContent=`Tai ${p.ear==='L'?'trái':'phải'} · ${p.freq.toLocaleString('vi')} Hz${repeat}`;
 // Hide the candidate intensity and posterior during testing to reduce response cues.
 $('toneMeta').textContent=`Điểm ${pointIndex+1}/${points.length} · ${stair.trials} lượt âm đã trả lời · tối đa ${engineMode==='bayesian'?stair.maxTrials:40} lượt âm/điểm`;
 $('toneProgress').style.width=`${100*pointIndex/points.length}%`;
 $('toneStatus').textContent='Bấm phát, chờ tín hiệu kết thúc rồi trả lời. Một số lượt có thể im lặng.';
 waiting=false;pendingPresentation=null;$('playTone').disabled=false;$('heard').disabled=$('notHeard').disabled=true;
}
$('playTone').onclick=async()=>{
 if(!session||session.type!=='tone'||waiting||busy)return;
 busy=true;const request=++playbackId,token=epoch,id=session.id,p={...points[pointIndex]},index=pointIndex,level=stair.level,isCatch=catchCountdown<=1;
 const selection=engineMode==='bayesian'?{...stair.selection}:{method:'staircase'};
 const startedAt=new Date().toISOString();$('playTone').disabled=true;$('toneStatus').textContent='Hãy tập trung…';
 try{
  const bounds=pointOptions(p);
  if(!Number.isFinite(level)||level<bounds.min||level>bounds.max)throw Error('Mức phát nằm ngoài giới hạn của điểm đo.');
  const ok=await tone(p.freq,level,p.ear,isCatch);
  if(!ok||session?.id!==id||token!==epoch||request!==playbackId)return;
  pendingPresentation={...p,pointIndex:index,sessionId:id,request,level,type:isCatch?'catch':'tone',selection,startedAt,completedAt:new Date().toISOString()};
  waiting=true;$('heard').disabled=$('notHeard').disabled=false;$('toneStatus').textContent='Bạn có nghe thấy âm trong lượt vừa rồi không?';
 }catch(e){if(request===playbackId&&session?.id===id){$('toneStatus').textContent=e.message;$('playTone').disabled=false;}}
 finally{if(request===playbackId)busy=false;}
};
function respond(heard){
 const presentation=pendingPresentation;
 if(!session||session.type!=='tone'||!waiting||typeof heard!=='boolean'||!presentation||presentation.request!==playbackId||presentation.sessionId!==session.id||presentation.pointIndex!==pointIndex)return;
 waiting=false;pendingPresentation=null;$('heard').disabled=$('notHeard').disabled=true;
 const p={ear:presentation.ear,freq:presentation.freq,phase:presentation.phase},at=new Date().toISOString();
 const timing={startedAt:presentation.startedAt,completedAt:presentation.completedAt,responseDelayMs:Date.parse(at)-Date.parse(presentation.completedAt)};
 if(presentation.type==='catch'){
  session.trials.push({...p,type:'catch',level:null,unit:'silent',heard,at,...timing});
  catchCountdown=5+Math.floor(Math.random()*4);save();renderTone();return;
 }
 catchCountdown--;
 session.trials.push({...p,type:'tone',level:presentation.level,levelHL:calPlan?C.toHL(presentation.level,calPlan[p.ear][p.freq].offset):null,unit:'dBFS_peak',heard,direction:engineMode==='staircase'?stair.direction:null,selection:presentation.selection,engine:session.engine.version,at,...timing});
 let outcome;
 try{outcome=engineMode==='bayesian'?B.advance(stair,heard):C.advance(stair,heard);}catch(e){session.engineError=e.message;warn('Đã dừng do lỗi cập nhật mô hình: '+e.message);finish('error');return;}
 if(outcome){
  const pp=calPlan&&calPlan[p.ear][p.freq],uncertaintyHL=pp&&outcome.uncertainty?{...outcome.uncertainty,lower:C.toHL(outcome.uncertainty.lower,pp.offset),upper:C.toHL(outcome.uncertainty.upper,pp.offset),unit:'dB_HL'}:null;
  session.results.push({...p,...outcome,engine:session.engine.version,options:pointOptions(p),ascending:engineMode==='staircase'?{...stair.ascending}:undefined,offset:pp?pp.offset:null,hl:pp&&outcome.level!==null?C.toHL(outcome.level,pp.offset):null,rangeHL:pp?[pp.minHL,pp.maxHL]:null,uncertaintyHL});
  pointIndex++;if(pointIndex===points.length){finish('completed');return;}stair=newStair(points[pointIndex]);
 }
 save();renderTone();
}
$('heard').onclick=()=>respond(true);$('notHeard').onclick=()=>respond(false);$('stopTone').onclick=()=>finish('stopped');
