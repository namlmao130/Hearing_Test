/* Pure calculation helpers shared by the browser and verification script. */
(function (root) {
  'use strict';
  const MIN = -70, MAX = -10;
  const r1 = x => Math.round(x * 10) / 10;
  // opts: { min, max, initial } in dBFS. Without opts the legacy uncalibrated range is used.
  function staircase(opts) {
    const o = opts || {};
    const min = o.min === undefined ? MIN : o.min, max = o.max === undefined ? MAX : o.max;
    const initial = o.initial === undefined ? -35 : o.initial;
    return { level: r1(Math.max(min, Math.min(max, initial))), min, max, direction: 0, trials: 0, floorHits: 0, ceilingMisses: 0, ascending: {} };
  }
  function advance(s, heard) {
    s.trials++;
    const level = s.level;
    // Count only presentations that belong to an ascending series. A miss after
    // a 10 dB descent starts the next ascending series at that level.
    const isAscendingPresentation = s.direction === 1 || !heard;
    if (isAscendingPresentation) {
      const bucket = s.ascending[level] || { presentations: 0, heard: 0 };
      bucket.presentations++;
      if (heard) bucket.heard++;
      s.ascending[level] = bucket;
      if (bucket.heard >= 2 && bucket.heard / bucket.presentations >= 0.5) {
        return { kind: 'estimate', level, trials: s.trials, confirmations: bucket };
      }
    }
    const lo = s.min === undefined ? MIN : s.min, hi = s.max === undefined ? MAX : s.max;
    s.floorHits = heard && level === lo ? s.floorHits + 1 : 0;
    s.ceilingMisses = !heard && level === hi ? s.ceilingMisses + 1 : 0;
    if (s.floorHits >= 2) return { kind: 'below_range', level: lo, trials: s.trials };
    if (s.ceilingMisses >= 2) return { kind: 'above_range', level: hi, trials: s.trials };
    if (s.trials >= 40) return { kind: 'inconclusive', level: null, trials: s.trials };
    // Standard manual threshold pattern: 10 dB down after a response, 5 dB up
    // after no response. The UI labels this as a screening implementation.
    s.direction = heard ? -1 : 1;
    s.level = r1(Math.max(lo, Math.min(hi, level + (heard ? -10 : 5))));
    return null;
  }
  function assessToneQuality(results, trials, expectedEars) {
    const catches = trials.filter(t => t.type === 'catch');
    const falsePositives = catches.filter(t => t.heard).length;
    const retests = {};
    for (const ear of ['L','R']) {
      const first = results.find(r => r.ear === ear && r.freq === 1000 && r.phase === 'primary' && r.kind === 'estimate');
      const repeat = results.find(r => r.ear === ear && r.freq === 1000 && r.phase === 'retest' && r.kind === 'estimate');
      if (first && repeat) retests[ear] = { first: first.level, repeat: repeat.level, difference: Math.abs(first.level-repeat.level), stable: Math.abs(first.level-repeat.level) <= 5 };
    }
    const retestValues = Object.values(retests);
    const catchRate = catches.length ? falsePositives / catches.length : null;
    const ears = expectedEars || [...new Set(results.map(r => r.ear))];
    const validPoint = (ear, freq, phase) => {
      const rows = results.filter(r => r.ear === ear && r.freq === freq && r.phase === phase);
      return rows.length === 1 && rows[0].kind === 'estimate' && Number.isFinite(rows[0].level);
    };
    const complete = ears.length > 0 && ears.every(ear => ['L','R'].includes(ear) && FREQS.every(freq => validPoint(ear,freq,'primary')) && validPoint(ear,1000,'retest'));
    const reliable = complete && catches.length >= 2 && catches.every(t => typeof t.heard === 'boolean') && falsePositives === 0 && ears.every(ear => retests[ear]?.stable) && results.every(r => r.kind === 'estimate');
    return { catches: catches.length, falsePositives, falsePositiveRate: catchRate, retests, reliable };
  }
  function normalize(s) { return s.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g,' '); }
  function nextSNR(snr, correct) { return Math.max(-9, Math.min(18, snr + (correct ? -3 : 3))); }
  function mix(speech, noise, snr) {
    if (!speech.length || speech.length !== noise.length) throw Error('Độ dài âm thanh không hợp lệ.');
    let sp=0,np=0;
    for(let i=0;i<speech.length;i++){sp+=speech[i]**2;np+=noise[i]**2;}
    sp=Math.sqrt(sp/speech.length);np=Math.sqrt(np/noise.length);
    if(sp<1e-7 || np<1e-7) throw Error('File im lặng hoặc mức âm quá nhỏ.');
    const ratio=10**(-snr/20), out=new Float32Array(speech.length);
    let peak=0;
    for(let i=0;i<out.length;i++){out[i]=speech[i]/sp+noise[i]/np*ratio;peak=Math.max(peak,Math.abs(out[i]));}
    // Scale the complete mixture together: preserve the requested RMS SNR, avoid clipping.
    const scale=Math.min(0.035,0.20/peak);
    for(let i=0;i<out.length;i++) out[i]*=scale;
    return { data:out, speechRMS:sp, noiseRMS:np, scale, snr };
  }

  // ---- Calibration (dBFS peak -> dB HL) ------------------------------------
  // The calibration tone is played at CAL_REF dBFS peak. A sound level meter on
  // a suitable coupler / ear simulator gives the SPL for that tone. With the
  // RETSPL of the transducer (from ISO 389 / ANSI S3.6) at the same frequency:
  //   offset(f, ear) = measuredSPL - CAL_REF - RETSPL(f)      [dB]
  //   dB HL = dBFS_peak + offset
  const CAL_REF = -10;          // dBFS peak of the calibration tone (= ceiling of the test)
  const FREQS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
  const SPL_CAP = 90;           // never present more than this SPL (dB) to the ear
  const HL_FLOOR = -10;         // lowest HL the test tries to reach
  const HL_START = 40;          // first presentation (dB HL)
  const DBFS_FLOOR = -100;      // below this the digital chain is not meaningful
  function calibrationOffset(measuredSPL, retspl) { return r1(measuredSPL - CAL_REF - retspl); }
  function toHL(levelDbfs, offset) { return r1(levelDbfs + offset); }
  function toDbfs(hl, offset) { return r1(hl - offset); }
  function validateCalibration(profile, now) {
    const problems = [], t = now === undefined ? Date.now() : now;
    if (!profile || typeof profile !== 'object') return { ok: false, problems: ['Chưa có hồ sơ hiệu chuẩn.'], expired: false };
    if (!profile.transducer || !String(profile.transducer).trim()) problems.push('Thiếu tên/mẫu tai nghe.');
    if (!profile.meter || !String(profile.meter).trim()) problems.push('Thiếu thiết bị đo (máy đo mức âm, coupler/ear simulator).');
    if (typeof profile.retsplSource !== 'string' || !profile.retsplSource.trim()) problems.push('Thiếu nguồn RETSPL.');
    const date = typeof profile.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profile.date) ? Date.parse(profile.date + 'T00:00:00Z') : NaN;
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== profile.date) problems.push('Ngày hiệu chuẩn không hợp lệ.');
    else if (date > t) problems.push('Ngày hiệu chuẩn không được ở tương lai.');
    if (!profile.env || !Number.isFinite(profile.env.sampleRate) || profile.env.sampleRate < 16000 || typeof profile.env.userAgent !== 'string' || !profile.env.userAgent.trim()) problems.push('Thiếu thông tin môi trường hiệu chuẩn gốc.');
    const measured = profile.measured || {}, retspl = profile.retspl || {};
    for (const ear of ['L', 'R']) for (const f of FREQS) {
      const raw = measured[ear]?.[f], m = Number(raw);
      if (!['number','string'].includes(typeof raw) || String(raw).trim() === '' || !Number.isFinite(m)) problems.push(`Thiếu SPL đo được: tai ${ear === 'L' ? 'trái' : 'phải'} ${f} Hz.`);
      else if (m < 20 || m > 120) problems.push(`SPL ngoài khoảng hợp lý (20–120 dB): tai ${ear === 'L' ? 'trái' : 'phải'} ${f} Hz.`);
    }
    for (const f of FREQS) {
      const v = Number(retspl[f]);
      if (!['number','string'].includes(typeof retspl[f]) || String(retspl[f]).trim() === '' || !Number.isFinite(v)) problems.push(`Thiếu RETSPL ${f} Hz.`);
      else if (v < -10 || v > 60) problems.push(`RETSPL ngoài khoảng hợp lý (-10–60 dB): ${f} Hz.`);
    }
    const exp = profile.expiresAt ? Date.parse(profile.expiresAt) : NaN;
    if (!Number.isFinite(exp)) problems.push('Thiếu ngày hết hạn hiệu chuẩn.');
    if (Number.isFinite(date) && Number.isFinite(exp) && (exp <= date || exp > date + 732*86400000)) problems.push('Thời hạn phải sau ngày đo và không quá 24 tháng.');
    const expired = Number.isFinite(exp) && t > exp;
    if (expired) problems.push('Hồ sơ hiệu chuẩn đã quá hạn.');
    return { ok: problems.length === 0, problems, expired };
  }
  // One ear/frequency: offset, reachable dBFS window and the dB HL span it covers.
  function pointPlan(measuredSPL, retspl) {
    const measured = Number(measuredSPL), off = calibrationOffset(measured, Number(retspl));
    // SPL at level x is measured + (x - CAL_REF). Cap it at SPL_CAP and at the -10 dBFS test ceiling.
    const capDbfs = CAL_REF + (SPL_CAP - measured);
    const max = Math.floor(Math.min(MAX, capDbfs)*10)/10;
    const min = Math.ceil(Math.max(DBFS_FLOOR, toDbfs(HL_FLOOR, off))*10)/10;
    const initial = r1(Math.max(min, Math.min(max, toDbfs(HL_START, off))));
    return { offset: off, min, max, initial, minHL: toHL(min, off), maxHL: toHL(max, off), maxSPL: r1(measured + (max - CAL_REF)), usable: min < max };
  }
  function calibrationPlan(profile) {
    const plan = {};
    for (const ear of ['L', 'R']) {
      plan[ear] = {};
      for (const f of FREQS) plan[ear][f] = pointPlan(profile.measured[ear][f], profile.retspl[f]);
    }
    return plan;
  }
  // The floor is "useful" only if it can resolve normal hearing (about 0 dB HL or lower).
  function floorWarnings(plan, ears) {
    const w = [], list = ears || ['L', 'R'];
    for (const ear of list) for (const f of FREQS) {
      const p = plan[ear][f], side = ear === 'L' ? 'trái' : 'phải';
      if (!p.usable) w.push(`Tai ${side} ${f} Hz: không còn khoảng mức phát khả dụng; giảm âm lượng hệ thống hoặc kiểm tra lại số đo.`);
      else if (p.minHL > 0) w.push(`Tai ${side} ${f} Hz: mức nhỏ nhất ${p.minHL} dB HL, chưa đo được thính lực bình thường. Hãy giảm âm lượng hệ thống và hiệu chuẩn lại.`);
      else if (p.maxHL < 60) w.push(`Tai ${side} ${f} Hz: mức lớn nhất chỉ ${p.maxHL} dB HL, không đo được mất thính lực nặng. Tăng âm lượng hệ thống (không vượt ${SPL_CAP} dB SPL) và hiệu chuẩn lại.`);
    }
    return w;
  }
  // Same device and software conditions as at calibration? (volume cannot be detected.)
  function environmentMatches(profile, env) {
    const issues = [];
    if (!profile?.env?.sampleRate || !profile?.env?.userAgent || !env?.sampleRate || !env?.userAgent) return ['Thiếu thông tin để đối chiếu môi trường hiệu chuẩn.'];
    if (profile.env && env) {
      if (profile.env.sampleRate && env.sampleRate && profile.env.sampleRate !== env.sampleRate) issues.push(`Tần số lấy mẫu khác (${profile.env.sampleRate} → ${env.sampleRate} Hz).`);
      if (profile.env.userAgent && env.userAgent && profile.env.userAgent !== env.userAgent) issues.push('Trình duyệt/hệ điều hành khác với lúc hiệu chuẩn.');
    }
    return issues;
  }
  // WHO 2021, World report on hearing, Table 1.3. These are descriptive
  // PTA4 grades, not a pass/refer protocol or a certification of this software.
  const WHO_SOURCE = 'https://www.who.int/publications/i/item/9789240020481';
  const WHO_PTA_FREQS = Object.freeze([500,1000,2000,4000]);
  const WHO_GRADES = Object.freeze([
    {code:'normal',min:null,max:20,label:'Trong khoảng bình thường theo PTA4'},
    {code:'mild',min:20,max:35,label:'Nghe kém nhẹ'},
    {code:'moderate',min:35,max:50,label:'Nghe kém trung bình'},
    {code:'moderately_severe',min:50,max:65,label:'Nghe kém trung bình–nặng'},
    {code:'severe',min:65,max:80,label:'Nghe kém nặng'},
    {code:'profound',min:80,max:95,label:'Nghe kém sâu'},
    {code:'complete',min:95,max:null,label:'Mất thính lực hoàn toàn theo PTA4'}
  ].map(Object.freeze));
  function whoGrade(pta) {
    if (!Number.isFinite(pta)) return null;
    return WHO_GRADES.find(g => g.max === null || pta < g.max);
  }
  function pta4(results, ear) {
    const values = WHO_PTA_FREQS.map(freq => {
      const rows = results.filter(r => r.ear === ear && r.freq === freq && r.phase === 'primary');
      return rows.length === 1 && rows[0].kind === 'estimate' && Number.isFinite(rows[0].hl) ? rows[0].hl : null;
    });
    // A bound, missing value, or duplicate must never become a measured threshold.
    return values.some(v => v === null) ? null : values.reduce((a,b) => a+b,0)/4;
  }
  function intakeDecision(intake) {
    const i = intake || {};
    if (i.sudden === true) return { allowed:false, code:'urgent', message:'Nghe giảm đột ngột: hãy đi khám Tai Mũi Họng hoặc cơ sở cấp cứu ngay; không chờ kết quả tự đo.' };
    if (i.earSymptoms === true) return { allowed:false, code:'medical', message:'Đang đau tai hoặc chảy dịch tai: hãy khám bác sĩ/nhân viên y tế trước khi tự đo.' };
    if (i.adult !== true) return { allowed:false, code:'age', message:'Phiên bản này dành cho người từ 18 tuổi. Người dưới 18 tuổi cần quy trình đánh giá phù hợp với tuổi tại cơ sở chuyên môn.' };
    if (i.reviewed !== true || typeof i.sudden !== 'boolean' || typeof i.earSymptoms !== 'boolean' || typeof i.difficulty !== 'boolean') return { allowed:false, code:'incomplete', message:'Hãy trả lời đầy đủ câu hỏi sức khỏe và xác nhận thông tin trước khi bắt đầu.' };
    return { allowed:true, code:'ready', message:i.difficulty ? 'Nếu thấy khó nghe trong sinh hoạt, nên khám chuyên khoa kể cả khi kết quả tự đo tốt.' : 'Có thể tiếp tục chuẩn bị. Dừng âm ngay nếu khó chịu.' };
  }
  function whoReport(s) {
    const report = { version:'who-pta4-2021-app-v1', source:WHO_SOURCE, classificationBasis:'WHO 2021 Table 1.3; better-ear PTA4', frequencies:[...WHO_PTA_FREQS], eligible:false, blockers:[], pta4:{L:null,R:null}, betterEar:null, betterEarPTA:null, grade:null, unilateral:null, recommendation:null };
    const block = text => report.blockers.push(text);
    if (!s || s.type !== 'tone') {
      block('Chỉ áp dụng cho phép đo âm đơn dB HL; bài lời nói trong nhiễu không dùng phân loại PTA4.');
      return report;
    }
    const results = Array.isArray(s.results) ? s.results.filter(r=>r && typeof r==='object') : [];
    const trials = Array.isArray(s.trials) ? s.trials.filter(t=>t && typeof t==='object') : [];
    if (results.length !== s.results?.length || trials.length !== s.trials?.length) block('Có bản ghi kết quả/lượt đo không hợp lệ.');
    const intake = intakeDecision(s.intake);
    if (!intake.allowed) block(intake.message);
    if (s.status !== 'completed') block('Phiên đo chưa hoàn thành.');
    if (s.calibrated !== true || s.unit !== 'dB_HL') block('Chưa có kết quả dB HL được hiệu chuẩn; dBFS không dùng phân mức WHO.');
    const ears = s.config?.ears;
    if (!Array.isArray(ears) || ears.length !== 2 || !ears.includes('L') || !ears.includes('R')) block('Cần đo cả hai tai để xác định tai nghe tốt hơn.');
    if (!assessToneQuality(results,trials,['L','R']).reliable) block('Chưa đạt kiểm tra nội bộ: đủ tần số, đo lại 1.000 Hz và lượt im lặng; không dùng điểm ngoài dải.');
    if (s.config?.environmentConfirmed !== true || s.config?.calibrationSetupConfirmed !== true) block('Thiếu xác nhận môi trường và đúng chuỗi thiết bị/âm lượng hiệu chuẩn tại thời điểm đo.');
    const noise = s.config?.noiseAssessment;
    if (!noise || noise.method !== 'documented' || typeof noise.details !== 'string' || !noise.details.trim()) block('Chưa ghi nhận đánh giá nhiễu nền bằng phương pháp phù hợp; xác nhận yên tĩnh bằng cảm nhận chưa đủ.');
    const started = Date.parse(s.startedAt), ended = Date.parse(s.endedAt);
    const profile = s.calibration?.profile;
    const validTimes = Number.isFinite(started) && Number.isFinite(ended) && ended >= started;
    if (!validTimes || !validateCalibration(profile,started).ok || !validateCalibration(profile,ended).ok) {
      block('Thiếu hồ sơ hiệu chuẩn hợp lệ trong toàn bộ thời gian phiên đo.');
    } else {
      if (environmentMatches(profile,s.config?.audioEnvironment).length) block('Môi trường phát âm của phiên không khớp hồ sơ hiệu chuẩn.');
      const plan = calibrationPlan(profile);
      if (results.some(r => !plan[r.ear]?.[r.freq] || !Number.isFinite(r.level) || !Number.isFinite(r.hl) ||
        r.level < plan[r.ear][r.freq].min || r.level > plan[r.ear][r.freq].max ||
        Math.abs(r.hl-toHL(r.level,plan[r.ear][r.freq].offset)) > 0.051)) block('Có điểm không khớp phép quy đổi/dải phát theo hồ sơ hiệu chuẩn.');
    }
    if (!report.blockers.length) {
      report.pta4 = {L:pta4(results,'L'),R:pta4(results,'R')};
      if (report.pta4.L === null || report.pta4.R === null) block('Thiếu ngưỡng chính xác tại một trong bốn tần số PTA4.');
      else {
        report.eligible = true;
        const left = report.pta4.L, right = report.pta4.R;
        report.betterEar = left === right ? 'equal' : left < right ? 'L' : 'R';
        report.betterEarPTA = Math.min(left,right);
        report.grade = whoGrade(report.betterEarPTA); // Do not round before grading.
        report.unilateral = Math.min(left,right) < 20 && Math.max(left,right) >= 35;
      }
    }
    const difficulty = s.intake?.difficulty === true;
    if (intake.code === 'urgent' || intake.code === 'medical') report.recommendation = intake.message;
    else if (difficulty) report.recommendation = 'Bạn báo khó nghe trong sinh hoạt: nên khám Tai Mũi Họng/chuyên gia thính học, dù PTA4 thấp.';
    else if (!report.eligible) report.recommendation = 'Chưa thể phân mức. Kiểm tra các điều kiện còn thiếu; đo lại với thiết bị và môi trường phù hợp hoặc đến cơ sở thính học. Không tự tăng âm lượng để vượt dải đo.';
    else if (Math.max(report.pta4.L,report.pta4.R) >= 20 || results.some(r=>r.phase==='primary' && r.hl>=20)) report.recommendation = 'Có ngưỡng tăng ở ít nhất một tai/tần số: nên được đánh giá thính học đầy đủ. Trung bình của tai tốt hơn có thể che khuất khó khăn ở tai còn lại hoặc ở tần số cao.';
    else report.recommendation = 'PTA4 nằm trong khoảng bình thường không loại trừ mọi khó khăn nghe. Theo dõi thay đổi, bảo vệ tai khỏi tiếng ồn và đi khám nếu có triệu chứng.';
    return report;
  }
  const api={ MIN,MAX,CAL_REF,FREQS,SPL_CAP,HL_FLOOR,HL_START,staircase,advance,assessToneQuality,normalize,nextSNR,mix,calibrationOffset,toHL,toDbfs,validateCalibration,pointPlan,calibrationPlan,floorWarnings,environmentMatches,WHO_SOURCE,WHO_PTA_FREQS,WHO_GRADES,whoGrade,pta4,intakeDecision,whoReport };
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.HearingCore=api;
})(globalThis);
