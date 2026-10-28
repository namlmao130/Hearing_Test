function addSample(){const row=document.createElement('div'),id=++sampleCounter;row.className='sample';row.innerHTML=`<label for="file${id}">File âm thanh</label><input id="file${id}" type="file" accept="audio/*"><label for="text${id}">Câu được đọc trong file</label><textarea id="text${id}" maxlength="500" placeholder="Ghi đúng transcript của file âm thanh"></textarea><button type="button">Bỏ câu này</button>`;row.querySelector('button').onclick=()=>row.remove();$('samples').appendChild(row);}
$('addSample').onclick=addSample;for(let i=0;i<3;i++)addSample();
function cancelSpeechLoad(){
 if(!speechLoad)return;
 speechLoad.fields.forEach(x=>x.disabled=false);speechLoad=null;
 $('speechLoadStatus').textContent='Đã hủy chuẩn bị khi rời trang. Bấm bắt đầu để kiểm tra lại các file.';
}
$('startSpeech').onclick=async()=>{
 if(session||busy||!checkIntake())return;
 const rows=[...$('samples').children];
 if(rows.length<3){$('speechLoadStatus').textContent='Cần ít nhất 3 câu nói khác nhau.';return;}
 busy=true;$('speechLoadStatus').textContent='Đang kiểm tra và giải mã âm thanh…';
 const fields=[...$('speechSetup').querySelectorAll('input,textarea,button')],load={fields,token:epoch};
 speechLoad=load;fields.forEach(x=>x.disabled=true);
 const current=()=>speechLoad===load&&load.token===epoch&&!session;
 try{
  const items=rows.map(r=>({file:r.querySelector('input').files[0],text:r.querySelector('textarea').value.trim()}));
  if(items.some(x=>!x.file||!C.normalize(x.text)))throw Error('Mỗi câu cần có file âm thanh và transcript.');
  if(new Set(items.map(x=>C.normalize(x.text))).size!==items.length)throw Error('Hãy dùng các câu khác nhau để tránh nhớ đáp án.');
  await audio();if(!current())return;
  const buffers=[];
  for(const item of items){
   if(item.file.size>20*1024*1024)throw Error('Mỗi file cần nhỏ hơn hoặc bằng 20 MB.');
   const bytes=await item.file.arrayBuffer();if(!current())return;
   const buffer=await ctx.decodeAudioData(bytes);if(!current())return;
   if(buffer.duration<.3||buffer.duration>30)throw Error('Mỗi câu cần dài từ 0,3 đến 30 giây.');
   let energy=0;for(let c=0;c<buffer.numberOfChannels;c++)for(const x of buffer.getChannelData(c))energy+=x*x;
   if(energy/buffer.length/buffer.numberOfChannels<1e-10)throw Error('Có file im lặng. Hãy chọn lại.');
   buffers.push({buffer,text:item.text,name:item.file.name});
  }
  for(let i=buffers.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[buffers[i],buffers[j]]=[buffers[j],buffers[i]];}
  if(!C.intakeDecision(readIntake()).allowed)throw Error('Thông tin sức khỏe đã thay đổi; hãy kiểm tra hướng dẫn trước khi bắt đầu.');
  speechBuffers=buffers;session=createSession('speech');
  session.config={noise:'synthetic_white',initialSNR:15,stepDB:3,scoring:'whole-sentence; ignore case, punctuation and whitespace; preserve Vietnamese accents',sampleCount:speechBuffers.length};
  speechIndex=0;snr=15;$('speechLoadStatus').textContent='';save();lockTabs(true);
  $('speechSetup').hidden=true;$('speechRun').hidden=false;$('result').hidden=true;renderSpeech();
 }catch(e){if(current())$('speechLoadStatus').textContent='Chưa bắt đầu: '+e.message;}
 finally{if(speechLoad===load){speechLoad=null;busy=false;fields.forEach(x=>x.disabled=false);}}
};
function renderSpeech(){pendingSpeech=null;waiting=false;$('speechTitle').textContent=`Câu ${speechIndex+1}/${speechBuffers.length} · SNR ${snr>0?'+':''}${snr} dB`;$('speechStatus').textContent='Bấm phát câu nói, sau đó nhập điều bạn nghe được.';$('answer').value='';$('answer').disabled=true;$('submitSpeech').disabled=true;$('playSpeech').disabled=false;$('nextSpeech').hidden=true;$('speechFeedback').textContent='';}
$('playSpeech').onclick=async()=>{if(!session||session.type!=='speech'||busy||waiting)return;busy=true;const id=session.id,token=epoch;$('playSpeech').disabled=true;$('speechStatus').textContent='Đang phát câu nói…';try{await audio();if(session?.id!==id||token!==epoch)return;const item=speechBuffers[speechIndex],buffer=item.buffer,mono=new Float32Array(buffer.length),noise=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const ch=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=ch[i]/buffer.numberOfChannels;}for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;const mixed=C.mix(mono,noise,snr),output=ctx.createBuffer(1,mono.length,buffer.sampleRate);output.copyToChannel(mixed.data,0);pendingSpeech={snr,file:item.name,expected:item.text,durationSeconds:buffer.duration,sampleRate:buffer.sampleRate,mixScale:mixed.scale};await new Promise(resolve=>{const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=output;source.connect(gain);gain.connect(ctx.destination);const now=ctx.currentTime,d=buffer.duration;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.01);gain.gain.setValueAtTime(1,now+d-.01);gain.gain.linearRampToValueAtTime(0,now+d);activeNodes.push(source);source.onended=()=>{gain.disconnect();activeNodes=activeNodes.filter(n=>n!==source);resolve();};source.start();});if(session?.id!==id||token!==epoch)return;waiting=true;$('answer').disabled=false;$('submitSpeech').disabled=false;$('answer').focus();$('speechStatus').textContent='Nhập câu bạn nghe được, rồi bấm chấm câu trả lời.';}catch(e){if(token===epoch&&session?.id===id){$('speechStatus').textContent=e.message;$('playSpeech').disabled=false;}}finally{if(token===epoch)busy=false;}};
$('submitSpeech').onclick=()=>{if(!session||session.type!=='speech'||!waiting||!pendingSpeech)return;waiting=false;const answer=$('answer').value,correct=C.normalize(answer)===C.normalize(pendingSpeech.expected);session.trials.push({...pendingSpeech,answer,correct,at:new Date().toISOString()});session.results.push({sentence:speechIndex+1,snr,correct});save();$('answer').disabled=true;$('submitSpeech').disabled=true;$('speechFeedback').textContent=`${correct?'Đúng cả câu.':'Chưa đúng cả câu.'} Đáp án: ${pendingSpeech.expected}`;$('speechStatus').textContent='Đã ghi nhận. Chấm theo toàn câu, bỏ qua viết hoa và dấu câu; giữ dấu tiếng Việt.';snr=C.nextSNR(snr,correct);$('nextSpeech').hidden=false;$('nextSpeech').textContent=speechIndex+1===speechBuffers.length?'Xem kết quả':'Câu tiếp theo';};
$('answer').onkeydown=e=>{if(e.key==='Enter')$('submitSpeech').click();};
$('nextSpeech').onclick=()=>{if(!session||session.type!=='speech')return;speechIndex++;if(speechIndex===speechBuffers.length)finish('completed');else renderSpeech();};$('stopSpeech').onclick=()=>finish('stopped');
function finish(status){if(!session)return;stopSound();waiting=false;session.status=status;session.endedAt=new Date().toISOString();if(session.type==='tone'){session.quality=C.assessToneQuality(session.results,session.trials,session.config.ears);session.interpretation=C.whoReport(session);}save();const completed=session;session=null;busy=false;lockTabs(false);$('toneRun').hidden=$('speechRun').hidden=true;$('toneSetup').hidden=$('speechSetup').hidden=false;showResult(completed);}
