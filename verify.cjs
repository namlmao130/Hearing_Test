const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./hearing-core.js');
for(const name of ['Demo.html','Tu-do-thinh-luc.html','interactive_visual_im.html']){
 const html=fs.readFileSync(__dirname+'/'+name,'utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:name});
}
function run(answer){const s=C.staircase();for(let i=0;i<45;i++){const r=C.advance(s,answer(s.level));if(r)return r;}throw Error('Did not terminate');}
assert.equal(run(()=>true).kind,'below_range');
assert.equal(run(()=>false).kind,'above_range');
for(const threshold of [-60,-45,-30,-15]){const r=run(l=>l>=threshold);assert.equal(r.kind,'estimate');assert.equal(r.level,threshold);assert.ok(r.confirmations.heard>=2);}
const quality=C.assessToneQuality([
 {ear:'L',freq:1000,phase:'primary',kind:'estimate',level:-30},
 {ear:'L',freq:1000,phase:'retest',kind:'estimate',level:-25},
 ...C.FREQS.filter(f=>f!==1000).map(freq=>({ear:'L',freq,phase:'primary',kind:'estimate',level:-30}))
],[{type:'catch',heard:false},{type:'catch',heard:false}]);
assert.equal(quality.reliable,true);assert.equal(quality.retests.L.difference,5);
assert.equal(C.assessToneQuality([
 {ear:'L',freq:1000,phase:'primary',kind:'estimate',level:-30},
 {ear:'L',freq:1000,phase:'retest',kind:'estimate',level:-20}
],[{type:'catch',heard:true},{type:'catch',heard:false}]).reliable,false);
assert.equal(C.normalize('  TÔI, đang đi! '),'tôi đang đi');
assert.notEqual(C.normalize('ma'),C.normalize('má'));
assert.equal(C.nextSNR(-9,true),-9);assert.equal(C.nextSNR(18,false),18);
const speech=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*500*i/48000));
const noise=Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*1100*i/48000));
for(const snr of [-9,0,15]){const mixed=C.mix(speech,noise,snr);assert.ok(mixed.data.every(v=>Math.abs(v)<=.20001));let a=0,b=0;for(let i=0;i<speech.length;i++){a+=mixed.data[i]*speech[i];b+=mixed.data[i]*noise[i];}assert.ok(Math.abs(20*Math.log10(Math.abs(a/b))-snr)<.001);}
assert.throws(()=>C.mix(new Float32Array(10),new Float32Array(10),0));

// ---- Calibration ----
const F=C.FREQS;
function profile(spl=83,ret=7,extra={}){const m={L:{},R:{}},r={};for(const f of F){m.L[f]=spl;m.R[f]=spl;r[f]=ret;}return{transducer:'Test headphone',meter:'SLM + 6cc coupler',retsplSource:'Synthetic test fixture only',date:new Date().toISOString().slice(0,10),env:{sampleRate:48000,userAgent:'Test environment'},measured:m,retspl:r,expiresAt:new Date(Date.now()+86400000*30).toISOString(),...extra};}
assert.equal(C.calibrationOffset(83,7),86);               // 83 dB SPL at -10 dBFS, RETSPL 7 -> 76 dB HL at -10 dBFS
assert.equal(C.toHL(-10,86),76);assert.equal(C.toDbfs(40,86),-46);
assert.equal(C.validateCalibration(profile()).ok,true);
assert.equal(C.validateCalibration(null).ok,false);
{const p=profile();delete p.measured.L[4000];const v=C.validateCalibration(p);assert.equal(v.ok,false);assert.ok(v.problems.some(x=>x.includes('4000')));}
{const p=profile();p.retspl[500]='';assert.equal(C.validateCalibration(p).ok,false);}
{const p=profile();p.measured.R[1000]=500;assert.equal(C.validateCalibration(p).ok,false);}
{const p=profile(83,7,{transducer:' '});assert.equal(C.validateCalibration(p).ok,false);}
{const v=C.validateCalibration(profile(83,7,{expiresAt:'2020-01-01T00:00:00Z'}));assert.equal(v.ok,false);assert.equal(v.expired,true);}
{const v=C.validateCalibration(profile(83,7,{expiresAt:undefined}));assert.equal(v.ok,false);}
{const plan=C.calibrationPlan(profile()),p=plan.L[1000];
 assert.equal(p.offset,86);assert.equal(p.max,-10);assert.equal(p.maxHL,76);assert.equal(p.min,-96);assert.equal(p.minHL,-10);assert.equal(p.initial,-46);assert.equal(p.maxSPL,83);
 assert.equal(C.floorWarnings(plan).length,0);}
{const p=C.calibrationPlan(profile(95,7)).L[1000];assert.equal(p.max,-15);assert.equal(p.maxSPL,90);assert.ok(p.maxSPL<=C.SPL_CAP);}   // SPL cap
{const w=C.floorWarnings(C.calibrationPlan(profile(60,7)));assert.ok(w.length>0);}                                                     // too quiet: max HL < 60
{const w=C.floorWarnings(C.calibrationPlan(profile(110,7)));assert.ok(w.length>0);}                                                    // too loud: floor above 0 dB HL
function runPlan(pt,answer){const s=C.staircase(pt);for(let i=0;i<45;i++){const r=C.advance(s,answer(s.level));if(r)return r;}throw Error('Did not terminate');}
{const pt=C.calibrationPlan(profile()).L[1000];
 for(const hl of [15,25,35]){const th=C.toDbfs(hl,pt.offset),r=runPlan(pt,l=>l>=th-1e-9);assert.equal(r.kind,'estimate');assert.equal(C.toHL(r.level,pt.offset),hl);}
 const lo=runPlan(pt,()=>true);assert.equal(lo.kind,'below_range');assert.equal(lo.level,pt.min);assert.equal(C.toHL(lo.level,pt.offset),-10);
 const hi=runPlan(pt,()=>false);assert.equal(hi.kind,'above_range');assert.equal(hi.level,pt.max);}
{const pt=C.calibrationPlan(profile(95,7)).R[2000];const hi=runPlan(pt,()=>false);assert.equal(hi.level,pt.max);assert.ok(95+(hi.level-C.CAL_REF)<=C.SPL_CAP+1e-9);}   // never above the SPL cap
assert.deepEqual(C.environmentMatches({env:{sampleRate:48000,userAgent:'A'}},{sampleRate:48000,userAgent:'A'}),[]);
assert.equal(C.environmentMatches({env:{sampleRate:48000,userAgent:'A'}},{sampleRate:44100,userAgent:'B'}).length,2);
// Reject incomplete provenance, corrupt imports, invalid/future dates and stale environments.
for(const extra of [{retsplSource:''},{date:''},{date:'2099-01-01'},{date:'2026-02-30'},{env:null},{env:{sampleRate:48000}},{measured:{L:null,R:{}}},{expiresAt:'2099-01-01'}]){
 assert.equal(C.validateCalibration(profile(83,7,extra)).ok,false,JSON.stringify(extra));
}
{const p=profile();p.retspl[1000]=true;assert.equal(C.validateCalibration(p).ok,false);}
assert.ok(C.environmentMatches({},{}).length);
assert.equal(C.assessToneQuality([{ear:'L',freq:1000,phase:'primary',kind:'estimate',level:-30},{ear:'L',freq:1000,phase:'retest',kind:'estimate',level:-30}],[{type:'catch',heard:false},{type:'catch',heard:false}]).reliable,false);
{const p=C.pointPlan(95.04,7);assert.ok(95.04+(p.max-C.CAL_REF)<=C.SPL_CAP);}
// Exercise the actual save handler without a browser: saving an import must not
// relabel its measurements as having been made on this machine.
const page=fs.readFileSync(__dirname+'/Tu-do-thinh-luc.html','utf8');
const handler=page.slice(page.indexOf("$('calSave').onclick="),page.indexOf("$('calExport').onclick="));
const fields={calSave:{},calRemeasured:{checked:false},calToneStatus:{textContent:''}};
const savedProfile=profile(),context={C,$:id=>fields[id],readProfile:()=>structuredClone(savedProfile),profileProblems:p=>C.validateCalibration(p).problems,envInfo:()=>({sampleRate:44100,userAgent:'Other machine'}),persistCal:()=>true,updateCalStatus:()=>{},refreshCal:()=>{},cal:null};
vm.createContext(context);vm.runInContext(handler,context);fields.calSave.onclick();
assert.equal(context.cal.env.userAgent,'Test environment');
fields.calRemeasured.checked=true;fields.calSave.onclick();assert.equal(context.cal.env.userAgent,'Other machine');
const previous=context.cal;savedProfile.retsplSource='';fields.calSave.onclick();assert.equal(context.cal,previous);
// WHO Table 1.3 boundaries: never classify a rounded PTA or an unmeasured bound.
for(const [value,code] of [[-10,'normal'],[19.999,'normal'],[20,'mild'],[34.999,'mild'],[35,'moderate'],[49.999,'moderate'],[50,'moderately_severe'],[64.999,'moderately_severe'],[65,'severe'],[79.999,'severe'],[80,'profound'],[94.999,'profound'],[95,'complete'],[110,'complete']])assert.equal(C.whoGrade(value).code,code);
for(const value of [null,undefined,NaN,Infinity,'20'])assert.equal(C.whoGrade(value),null);
const readyIntake={adult:true,sudden:false,earSymptoms:false,difficulty:false,reviewed:true};
assert.equal(C.intakeDecision(readyIntake).allowed,true);
assert.equal(C.intakeDecision({...readyIntake,sudden:true,adult:false}).code,'urgent');
assert.equal(C.intakeDecision({...readyIntake,earSymptoms:true}).allowed,false);
assert.equal(C.intakeDecision({...readyIntake,adult:false}).allowed,false);
assert.equal(C.intakeDecision({...readyIntake,difficulty:null}).allowed,false);
assert.equal(C.intakeDecision({...readyIntake,reviewed:false}).allowed,false);

function sessionFixture(left=15,right=15){
 const p=profile(),plan=C.calibrationPlan(p),results=[];
 for(const ear of ['L','R'])for(const [freq,phase] of [...F.map(f=>[f,'primary']),[1000,'retest']]){
  const hl=ear==='L'?left:right,level=C.toDbfs(hl,plan[ear][freq].offset);
  results.push({ear,freq,phase,kind:'estimate',hl,level,trials:8});
 }
 return {type:'tone',status:'completed',calibrated:true,unit:'dB_HL',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),calibration:{profile:p},intake:{...readyIntake},config:{ears:['L','R'],environmentConfirmed:true,calibrationSetupConfirmed:true,audioEnvironment:{...p.env},noiseAssessment:{method:'documented',details:'Synthetic acoustic test fixture only'}},results,trials:[{ear:'L',type:'catch',heard:false},{ear:'R',type:'catch',heard:false}]};
}
assert.equal(C.whoReport(sessionFixture()).eligible,true);
assert.equal(C.whoReport(sessionFixture()).grade.code,'normal');
{const r=C.whoReport(sessionFixture(40,15));assert.equal(r.betterEar,'R');assert.equal(r.grade.code,'normal');assert.equal(r.unilateral,true);assert.match(r.recommendation,/chuyên|thính học/);}
assert.equal(C.whoReport(sessionFixture(15,34.9)).unilateral,false);
assert.equal(C.whoReport(sessionFixture(20,40)).unilateral,false);
assert.equal(C.whoReport(sessionFixture(35,50)).grade.code,'moderate');
{const s=sessionFixture(20,30);const r=s.results.find(r=>r.ear==='L'&&r.freq===500);r.hl=19.9;r.level=C.toDbfs(r.hl,86);const report=C.whoReport(s);assert.equal(report.pta4.L,19.975);assert.equal(report.grade.code,'normal');}
{const s=sessionFixture();s.results.find(r=>r.ear==='L'&&r.phase==='retest').hl=20;s.results.find(r=>r.ear==='L'&&r.phase==='retest').level=-66;assert.equal(C.whoReport(s).pta4.L,15);}
// Historic measurements remain interpretable after the profile later expires;
// expiry during the session or invalid start/end dates must block grading.
{const s=sessionFixture();s.startedAt='2024-05-01T12:00:00Z';s.endedAt='2024-05-01T12:20:00Z';s.calibration.profile.date='2024-01-01';s.calibration.profile.expiresAt='2025-01-01T00:00:00Z';assert.equal(C.whoReport(s).eligible,true);s.endedAt='2025-02-01T00:00:00Z';assert.equal(C.whoReport(s).eligible,false);}
for(const change of [
 s=>s.unit='dBFS_peak',s=>s.calibrated=false,s=>s.status='stopped',
 s=>s.config.ears=['L'],s=>s.results=s.results.filter(r=>r.ear==='L'),
 s=>s.results=s.results.filter(r=>r.freq!==500),s=>s.results.push({...s.results[0]}),
 s=>s.results[1].kind='below_range',s=>s.results[1].kind='above_range',
 s=>s.results[1].hl=null,s=>s.results[1].hl='15',s=>s.results[1].hl=NaN,
 s=>s.results[1].hl+=10,s=>s.results[1].level=500,
 s=>s.results.find(r=>r.ear==='R'&&r.phase==='retest').level+=10,
 s=>s.trials[0].heard=true,s=>s.trials=[],
 s=>delete s.trials[0].heard,s=>s.results.push(null),s=>s.trials.push(null),
 s=>s.calibration=null,s=>s.calibration.profile.retsplSource='',
 s=>s.config.audioEnvironment.sampleRate=44100,s=>delete s.config.audioEnvironment,
 s=>s.config.environmentConfirmed=false,s=>s.config.calibrationSetupConfirmed=false,
 s=>s.config.noiseAssessment.method='self_report',s=>s.config.noiseAssessment.details=' ',
 s=>delete s.intake,s=>s.intake.adult=false,s=>s.intake.reviewed=false,
 s=>s.intake.sudden=true,s=>s.startedAt='invalid',s=>s.endedAt='2000-01-01'
]){const s=sessionFixture();change(s);const r=C.whoReport(s);assert.equal(r.eligible,false,change.toString());assert.equal(r.grade,null);assert.ok(r.blockers.length);}
{const s=sessionFixture();s.intake.difficulty=true;assert.match(C.whoReport(s).recommendation,/dù PTA4 thấp/);}
{const s=sessionFixture();s.results.find(r=>r.freq===8000).hl=40;s.results.find(r=>r.freq===8000).level=-46;assert.equal(C.whoReport(s).grade.code,'normal');assert.match(C.whoReport(s).recommendation,/tần số/);}
assert.equal(C.whoReport({type:'speech'}).eligible,false);
assert.equal(C.whoReport(null).eligible,false);
// Experimental provenance blocks WHO on live results, history and exports.
for(const mark of [s=>s.engine={id:'bayesian'},s=>s.engine={experimental:true},s=>s.algorithm='bayesian-threshold-v1',s=>s.results[0].engine='bayesian-threshold-v1',s=>s.results[0].uncertainty={conditionalOnModel:true}]){
 const s=sessionFixture();mark(s);assert.equal(C.isExperimentalTone(s),true);const report=C.whoReport(s);assert.equal(report.eligible,false);assert.equal(report.grade,null);assert.ok(report.blockers.some(t=>t.includes('Bayesian')));
}
{const s=sessionFixture();s.results=s.results.filter(r=>r.ear==='L');assert.equal(C.assessToneQuality(s.results,s.trials,['L','R']).reliable,false);}

// Run the real page result renderer against a small DOM double: this verifies
// missing eligibility never renders a reassuring classification, including old history.
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.textContent='';this.hidden=false;}
 appendChild(child){this.children.push(child);return child;}
 replaceChildren(){this.children=[];this.textContent='';}
}
const box=new Element('div'),dom={C,$:id=>{assert.equal(id,'whoResult');return box;},document:{createElement:tag=>new Element(tag)}};
vm.createContext(dom);
vm.runInContext(page.slice(page.indexOf('function table('),page.indexOf('function readIntake('))+page.slice(page.indexOf('function renderWhoReport('),page.indexOf('function levelText(')),dom);
function allText(node){return node.textContent+' '+node.children.map(allText).join(' ');}
dom.renderWhoReport(sessionFixture(40,15));assert.equal(box.hidden,false);assert.match(allText(box),/Có dấu hiệu/);
{const s=sessionFixture();s.unit='dBFS_peak';dom.renderWhoReport(s);assert.match(allText(box),/Chưa đủ điều kiện/);assert.ok(!box.children.some(n=>n.tagName==='table'));}
dom.renderWhoReport({type:'speech'});assert.equal(box.hidden,true);assert.equal(box.children.length,0);
// Verify the actual start handlers stop before audio/session creation for an
// unsuitable intake. No browser is launched and no sound is played.
const handlers={startTone:{},startSpeech:{}},gated={session:null,busy:false,checkIntake:()=>false,$:id=>handlers[id]};
vm.createContext(gated);
vm.runInContext(page.slice(page.indexOf("$('startTone').onclick="),page.indexOf('function renderTone(')),gated);
vm.runInContext(page.slice(page.indexOf("$('startSpeech').onclick="),page.indexOf('function renderSpeech(')),gated);
handlers.startTone.onclick();handlers.startSpeech.onclick();assert.equal(gated.session,null);
// A prepared calibrated start captures all eligibility evidence in the session.
{const fields={toneMethod:{value:'staircase'},methodBadge:{},startTone:{},device:{value:'Test headphones'},quiet:{checked:true},ready:{checked:true},ears:{value:'both'},useCal:{value:'yes'},calSame:{checked:true},noiseMethod:{value:'documented'},noiseDetails:{value:'Room record 123'},result:{},toneSetup:{},toneRun:{}};
 const p=profile(),start={C,FREQS:F,TONE_ORDER:F.map(freq=>({freq,phase:'primary'})),session:null,busy:false,cal:p,checkIntake:()=>true,$:id=>fields[id],stopSound:()=>{},calGate:()=>({ok:true,plan:C.calibrationPlan(p)}),warn:message=>{throw Error(message);},newStair:()=>({}),createSession:()=>({type:'tone'}),envInfo:()=>({...p.env}),save:()=>{},lockTabs:()=>{},renderTone:()=>{}};
 vm.createContext(start);vm.runInContext(page.slice(page.indexOf("$('startTone').onclick="),page.indexOf('function renderTone(')),start);fields.startTone.onclick();
 assert.equal(start.session.unit,'dB_HL');assert.equal(start.session.config.calibrationSetupConfirmed,true);assert.equal(start.session.config.noiseAssessment.details,'Room record 123');assert.equal(start.session.config.audioEnvironment.sampleRate,48000);assert.equal(start.points.length,16);
}
// The actual completion handler saves the derived report with source and context.
{const current=sessionFixture(35,50);current.status='in_progress';const saved=[];
 const finishFields=new Proxy({}, {get:(o,k)=>o[k]||(o[k]={})});
 const finishContext={C,session:current,stopSound:()=>{},save:()=>saved.push(structuredClone(finishContext.session)),lockTabs:()=>{},showResult:s=>{assert.equal(s.status,'completed');},$:id=>finishFields[id]};
 vm.createContext(finishContext);vm.runInContext(page.slice(page.indexOf('function finish('),page.indexOf('function table(')),finishContext);finishContext.finish('completed');
 assert.equal(saved[0].interpretation.grade.code,'moderate');assert.equal(saved[0].interpretation.source,C.WHO_SOURCE);assert.equal(finishContext.session,null);
}
// Export recomputes rather than trusting an obsolete saved label; inspect payload.
{let payload,clicked=false;const exporting={C,Blob:class {constructor(parts){payload=JSON.parse(parts[0]);}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},document:{createElement:()=>({click:()=>{clicked=true;}})},setTimeout:fn=>fn()};
 vm.createContext(exporting);vm.runInContext(page.slice(page.indexOf('function download('),page.indexOf("$('exportResult').onclick=")),exporting);
 const s=sessionFixture(40,15);s.interpretation={grade:{code:'severe'}};exporting.download(s);
 assert.equal(clicked,true);assert.equal(payload.interpretation.grade.code,'normal');assert.equal(payload.interpretation.unilateral,true);assert.equal(payload.intake.adult,true);assert.deepEqual(payload.results,s.results);
}
console.log('PASS: core algorithms, calibration, WHO PTA4 boundaries, unilateral criteria, gating and historical interpretation.');
