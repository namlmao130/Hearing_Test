'use strict';
// Deterministic storage and asynchronous page-handler tests. No browser, audio,
// localStorage or network is used; promises let us control cancellation timing.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const project = require('./project.cjs');
const S = require('../src/storage/session-store.js');
const C = require('../src/core/hearing-core.js');
const B = require('../src/core/bayesian-core.js');
const page = project.selfTestSource(), html = project.read('Tu-do-thinh-luc.html');
const slice = (start,end) => {
  const a=page.indexOf(start), b=page.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, `page handler exists: ${start}`);
  return page.slice(a,b);
};
const clone = x => JSON.parse(JSON.stringify(x));
const stamp = '2026-01-01T00:00:00.000Z';
function fixture(id='tone-1') {
  return {schemaVersion:1,id,type:'tone',status:'in_progress',startedAt:stamp,
    calibrated:false,unit:'dBFS_peak',config:{ears:['L']},results:[],trials:[]};
}
function storage(initial=null) {
  let raw=initial;
  return {get raw(){return raw;},fail:false,getItem:()=>raw,setItem(key,value){if(this.fail)throw Error('QuotaExceededError');raw=value;}};
}
function storageTests() {
  const state=B.create(), trials=[]; let outcome;
  while(!state.done){const level=state.level,heard=level>=-45;trials.push({ear:'L',freq:1000,phase:'primary',type:'tone',level,heard});outcome=B.advance(state,heard);}
  const tone={...fixture(),trials,results:[{...outcome,ear:'L',freq:1000,phase:'primary'}]};
  assert.equal(S.decode(JSON.stringify([tone])).rejected.length,0);
  const speech={...fixture('speech-1'),type:'speech',unit:'dB_SNR',trials:[{snr:15,correct:true,answer:'xin chào',expected:'xin chào'}],results:[{sentence:1,snr:15,correct:true}]};
  assert.equal(S.decode(JSON.stringify([speech])).rejected.length,0);
  const data=storage(JSON.stringify([tone])), store=S.create(data,'history'), loaded=store.load();
  assert.equal(loaded.sessions[0].status,'interrupted');
  assert.equal(JSON.parse(data.raw)[0].status,'in_progress','reading must preserve original bytes');
  assert.equal(store.write([tone,speech]).ok,true);
  const previous=data.raw;data.fail=true;
  assert.equal(store.write([tone]).ok,false);assert.equal(data.raw,previous,'quota failure must not remove old history');
  data.fail=false;assert.equal(store.write([tone]).ok,true,'retry after quota failure');
  const external=JSON.stringify([speech]);data.setItem('history',external);
  assert.equal(store.write([tone]).ok,false);assert.equal(data.raw,external,'stale tab cannot overwrite newer history');
  assert.equal(store.blocked,true);
  for (const raw of ['{broken',JSON.stringify([tone,null]),JSON.stringify([tone,tone]),'{}',JSON.stringify([{...tone,schemaVersion:99}])]) {
    const memory=storage(raw), repo=S.create(memory,'history'), result=repo.load();
    assert.equal(result.blocked,true);assert.equal(repo.write([fixture()]).ok,false);assert.equal(memory.raw,raw);
    assert.equal(repo.original(),raw,'damaged payload remains available for download');
  }
  const unavailable=S.create({getItem(){throw Error('SecurityError');}},'history');
  assert.equal(unavailable.load().blocked,true);assert.equal(unavailable.write([tone]).ok,false);
  for(const mutate of [
    s=>s.results.push(null),s=>s.results[0].level='-40',s=>s.results[0].level=1e100,
    s=>s.results[0].uncertainty.lower=-1e100,s=>s.results[0].engine={},
    s=>s.trials[0].heard='yes',s=>s.trials[0].ear='X',s=>s.config.ears='L',
    s=>s.calibrated=true,s=>s.status='completed',s=>s.id='',s=>s.startedAt='bad',
    s=>s.engine={version:{}},s=>s.results.push(clone(s.results[0]))
  ]) {const bad=clone(tone);mutate(bad);assert.equal(S.decode(JSON.stringify([bad])).rejected.length,1,mutate.toString());}
  assert.throws(()=>S.decode('[{"__proto__":{}}]'));
  assert.throws(()=>S.decode('[1e999]'));
  assert.throws(()=>S.decode(' '.repeat(S.MAX_BYTES+1)));
  const restored=S.merge([],JSON.stringify(tone));assert.equal(restored[0].status,'interrupted');
  assert.equal(S.merge(restored,JSON.stringify(restored[0])).length,1,'same record import is idempotent');
  const different=clone(restored[0]);different.trials[0].heard=!different.trials[0].heard;
  assert.throws(()=>S.merge(restored,JSON.stringify(different)),/không ghi đè/);
  assert.throws(()=>S.merge(restored,JSON.stringify([speech,null])),'mixed good/bad import is atomic');
  assert.equal(restored.length,1);
  const reordered=Object.fromEntries(Object.entries(restored[0]).reverse());reordered.interpretation={obsolete:true};
  assert.equal(S.merge(restored,JSON.stringify(reordered)).length,1,'ignore order and derived classification only');
  assert.equal(C.whoReport(restored[0]).eligible,false,'restoration cannot bypass WHO gate');
  const invalidFit=clone(outcome);invalidFit.posterior.modelFit.biasedCoinLogBayesFactor=0;
  assert.equal(C.validBayesianUncertainty(invalidFit),false);
  invalidFit.posterior.modelFit.biasedCoinLogBayesFactor=10;invalidFit.posterior.modelFit.minimumForEstimate=0;
  assert.equal(C.validBayesianUncertainty(invalidFit),false,'persisted policy cannot weaken evidence requirement');
}
function pageStorageTests(){
  const memory=storage(),ui=fields();ui.device.value='Test device';
  const context={HearingSessionStore:S,localStorage:memory,KEY:'history',Date,Math,C,B,
    session:null,points:[],pointIndex:0,stair:null,$:id=>ui[id],readIntake:()=>({adult:true})};
  vm.createContext(context);vm.runInContext(slice('let sessions=[];','async function audio()'),context);
  context.session=context.createSession('tone');context.session.config={ears:['L']};context.save();
  assert.equal(S.decode(memory.raw).rejected.length,0,'actual create/save bridge produces compatible records');
  assert.equal(JSON.parse(memory.raw)[0].appVersion,'3.2-professional-src');
  memory.fail=true;context.save();assert.equal(ui.storageWarning.hidden,false);
  assert.match(ui.storageWarning.textContent,/Chưa lưu được/);
  // Loading a corrupt payload through the actual page bridge must never
  // overwrite it on the first new answer, even though valid sessions continue.
  const broken=storage('{broken'),ctx={...context,localStorage:broken,session:null};
  vm.createContext(ctx);vm.runInContext(slice('let sessions=[];','async function audio()'),ctx);
  ctx.session=ctx.createSession('tone');ctx.session.config={ears:['L']};ctx.save();
  assert.equal(broken.raw,'{broken');
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fields(){return new Proxy({}, {get:(obj,key)=>obj[key]||(obj[key]={textContent:'',disabled:false,hidden:false})});}
function lifecycle(context){
  vm.runInContext(slice('function stopSound()','function route(')+
    slice('function cancelSpeechLoad()',"$('startSpeech').onclick=")+
    slice('function pausePlayback()','// ---------------- Hiệu chuẩn'),context);
}
async function speechTests() {
  for(const stage of ['audio','file','decode']) {
    const hold=deferred(), ui=fields(), buffer={duration:1,numberOfChannels:1,length:4,getChannelData:()=>new Float32Array([.1,.2,.1,.2])};
    const rows=[0,1,2].map(i=>({querySelector:selector=>selector==='input'?{files:[{name:`sample${i}.wav`,size:10,arrayBuffer:()=>stage==='file'?hold.promise:Promise.resolve(new ArrayBuffer(4))}]}:{value:`Câu ${i}`}}));
    ui.samples.children=rows;ui.speechSetup.querySelectorAll=()=>[ui.startSpeech];
    const context={C,Math,session:null,busy:false,epoch:0,playbackId:0,pendingPresentation:null,activeNodes:[],speechLoad:null,
      speechBuffers:[],checkIntake:()=>true,$:id=>ui[id],resetCalBtn:()=>{},
      audio:()=>stage==='audio'?hold.promise:Promise.resolve(),ctx:{decodeAudioData:()=>stage==='decode'?hold.promise:Promise.resolve(buffer)},
      createSession:()=>{throw Error('stale operation created a session');},readIntake:()=>({}),save:()=>{},lockTabs:()=>{},renderSpeech:()=>{}};
    vm.createContext(context);lifecycle(context);
    vm.runInContext(slice("$('startSpeech').onclick=",'function renderSpeech()'),context);
    const pending=ui.startSpeech.onclick();await tick();
    assert.equal(context.busy,true);context.pausePlayback();
    assert.equal(ui.startSpeech.disabled,false,'cancellation unlocks setup controls');
    assert.equal(context.session,null);assert.equal(context.busy,false);
    // A newer task owns busy and buffers before the old promise settles.
    context.busy=true;context.speechBuffers=['new'];
    const sentinel={id:'new-session',type:'tone'};context.session=sentinel;
    hold.resolve(stage==='decode'?buffer:stage==='file'?new ArrayBuffer(4):undefined);await pending;
    assert.equal(context.session,sentinel);assert.equal(context.busy,true);
    assert.deepEqual(context.speechBuffers,['new']);
  }
  // Happy path exercises actual new session creation and the storage schema.
  const ui=fields(),buffer={duration:1,numberOfChannels:1,length:2,getChannelData:()=>new Float32Array([.1,.2])};
  ui.samples.children=[0,1,2].map(i=>({querySelector:key=>key==='input'?{files:[{size:10,name:`${i}.wav`,arrayBuffer:async()=>new ArrayBuffer(2)}]}:{value:`Câu ${i}`}}));
  ui.speechSetup.querySelectorAll=()=>[ui.startSpeech];
  let saved;
  const context={C,Math,session:null,busy:false,epoch:0,speechLoad:null,speechBuffers:[],checkIntake:()=>true,$:id=>ui[id],
    audio:async()=>{},ctx:{decodeAudioData:async()=>buffer},readIntake:()=>({adult:true,sudden:false,earSymptoms:false,difficulty:false,reviewed:true}),
    createSession:()=>({...fixture('speech-ok'),type:'speech',unit:'dB_SNR'}),save:()=>{saved=clone(context.session);},lockTabs:()=>{},renderSpeech:()=>{}};
  vm.createContext(context);vm.runInContext(slice("$('startSpeech').onclick=",'function renderSpeech()'),context);
  await ui.startSpeech.onclick();assert.equal(context.busy,false);assert.equal(context.speechBuffers.length,3);
  assert.equal(S.decode(JSON.stringify([saved])).rejected.length,0);
}
async function toneTests() {
  const hold=deferred(),ui=fields(),state=B.create(),p={ear:'L',freq:1000,phase:'primary'};
  const context={B,C,Date,Math,session:{id:'old',type:'tone'},busy:false,waiting:false,epoch:0,playbackId:0,
    pointIndex:0,points:[p],stair:state,engineMode:'bayesian',catchCountdown:6,pendingPresentation:null,activeNodes:[],speechLoad:null,
    $:id=>ui[id],pointOptions:()=>({min:-70,max:-10}),tone:()=>hold.promise,resetCalBtn:()=>{}};
  vm.createContext(context);lifecycle(context);
  vm.runInContext(slice("$('playTone').onclick=",'function respond('),context);
  const pending=ui.playTone.onclick();context.pausePlayback();
  assert.equal(context.waiting,false);assert.equal(context.pendingPresentation,null);assert.equal(ui.heard.disabled,true);
  context.session={id:'new',type:'tone'};context.busy=true;ui.heard.disabled=true;
  hold.resolve(true);await pending;
  assert.equal(context.busy,true);assert.equal(context.waiting,false);assert.equal(context.pendingPresentation,null);
  assert.equal(ui.heard.disabled,true,'old completion cannot enable response buttons');
  // A fresh successful presentation must record the exact completed level.
  context.busy=false;context.tone=async()=>true;await ui.playTone.onclick();
  assert.equal(context.pendingPresentation.level,state.level);assert.equal(context.pendingPresentation.sessionId,'new');
  assert.equal(context.waiting,true);
}
async function importTests(){
  const hold=deferred(),ui=fields();let saves=0;
  const context={session:null,busy:false,epoch:0,sessions:[],HearingSessionStore:S,$:id=>ui[id],persist:()=>{saves++;return true;},renderHistory:()=>{}};
  vm.createContext(context);vm.runInContext(slice("$('importHistory').onchange=",'function pausePlayback()'),context);
  const event={target:{files:[{size:10,text:()=>hold.promise}],value:'input'}};
  const pending=ui.importHistory.onchange(event);context.epoch++;context.busy=true;
  ui.importHistory.disabled=true;
  hold.resolve(JSON.stringify([fixture()]));await pending;
  assert.equal(saves,0);assert.equal(context.sessions.length,0);assert.equal(context.busy,true);
  assert.equal(ui.importHistory.disabled,true,'stale import must not unlock a newer operation');
}
(async()=>{
  for(const file of project.SELF_TEST_FILES)new vm.Script(project.read(file),{filename:file});
  assert.ok(html.includes('<script src="src/storage/session-store.js"></script>'));
  const browser={};vm.createContext(browser);
  for(const file of ['src/core/hearing-core.js','src/core/bayesian-core.js','src/storage/session-store.js'])vm.runInContext(project.read(file),browser);
  assert.equal(browser.HearingSessionStore.decode(JSON.stringify([fixture()])).sessions.length,1,'browser globals load without CommonJS');
  storageTests();pageStorageTests();await speechTests();await toneTests();await importTests();
  console.log('PASS: storage schema, corruption preservation, quota, stale-tab conflict, JSON recovery, v3 evidence gate and asynchronous cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
