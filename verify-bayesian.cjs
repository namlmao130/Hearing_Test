'use strict';

// Numerical/synthetic verification only: this script does not play audio and
// cannot establish acoustic calibration or clinical measurement accuracy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const B = require('./bayesian-core.js');
const C = require('./hearing-core.js');

const DEFAULT_PLAN = Object.freeze({ min: -70, max: -10, initial: -35 });
const SEED = 0x6841bc29;
const round = value => value === null ? null : Math.round(value * 10000) / 10000;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

// Mulberry32: an independent, reproducible source of simulated responses.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    let t = state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function logistic(level, threshold, scale, falsePositive, lapse) {
  // theta is the actual 50%-heard level, including asymmetric response errors.
  const midpoint = (0.5 - falsePositive) / (1 - falsePositive - lapse);
  const shift = Math.log(midpoint / (1 - midpoint));
  return falsePositive + (1 - falsePositive - lapse) / (1 + Math.exp(-((level - threshold) / scale + shift)));
}

function run(engine, answer, options = DEFAULT_PLAN) {
  const range = { min: options.min, max: options.max, initial: options.initial };
  const state = engine === 'bayesian' ? B.create(range) : C.staircase(range);
  const trace = [];
  const max = engine === 'bayesian' ? state.maxTrials : 40;
  for (let i = 0; i < max + 1; i++) {
    assert.ok(Number.isFinite(state.level), `${engine}: finite stimulus`);
    assert.ok(state.level >= options.min && state.level <= options.max,
      `${engine}: ${state.level} outside [${options.min}, ${options.max}]`);
    if (engine === 'bayesian' && trace.length) {
      assert.ok(state.level - trace[trace.length - 1].level <= B.DEFAULTS.maxUpwardStep + 1e-9,
        'active selection cannot jump upward through the permitted step limit');
    }
    const heard = answer(state.level, i);
    assert.equal(typeof heard, 'boolean');
    trace.push({ level: state.level, heard });
    const outcome = engine === 'bayesian' ? B.advance(state, heard) : C.advance(state, heard);
    if (outcome) {
      assert.equal(outcome.trials, trace.length);
      assert.ok(trace.length <= max, `${engine}: bounded run`);
      assert.ok(['estimate', 'below_range', 'above_range', 'inconclusive'].includes(outcome.kind));
      if (outcome.kind === 'estimate') assert.ok(Number.isFinite(outcome.level));
      if (engine === 'bayesian') {
        assert.equal(typeof outcome.stopReason, 'string');
        assert.ok(outcome.stopReason.length > 0);
        assert.equal(outcome.uncertainty.unit, 'dBFS_peak');
        assert.equal(outcome.uncertainty.conditionalOnModel, true);
        assert.ok(outcome.uncertainty.lower <= outcome.uncertainty.upper);
        assert.ok(Math.abs(outcome.uncertainty.width - (outcome.uncertainty.upper - outcome.uncertainty.lower)) < 0.11);
        assert.equal(typeof outcome.posterior.modelFit.logBayesFactor, 'number');
        if (outcome.kind === 'estimate') {
          assert.equal(outcome.posterior.modelFit.sufficient, true);
          assert.equal(C.validBayesianUncertainty(outcome), true);
          assert.ok(outcome.posterior.modelFit.biasedCoinLogBayesFactor >= Math.log(20) - 1e-6);
        }
      }
      return { outcome, trace, state };
    }
  }
  throw Error(`${engine}: no terminal outcome within maximum trials`);
}

function validate() {
  assert.equal(typeof B.VERSION, 'string');
  assert.ok(B.DEFAULTS.minTrials > 1 && B.DEFAULTS.maxTrials >= B.DEFAULTS.minTrials);
  assert.ok(B.DEFAULTS.credibleMass > 0.5 && B.DEFAULTS.credibleMass < 1);
  assert.ok(B.DEFAULTS.targetWidth > 0);
  const browser = { console };
  vm.createContext(browser);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'bayesian-core.js'), 'utf8'), browser);
  assert.equal(browser.BayesianHearing.VERSION, B.VERSION, 'browser and CommonJS entry points');

  for (const options of [null, 'invalid', { min: NaN }, { max: Infinity },
    { min: -10, max: -70 }, { min: -30, max: -30 }, { min: '-70' },
    { initial: NaN }, { minTrials: 0 }, { maxTrials: 1 },
    { minTrials: 18, maxTrials: 12 }, { minTrials: 12.5 },
    { credibleMass: 1 }, { credibleMass: 0.5 }, { targetWidth: -1 },
    { minModelLogBayesFactor: -11 }, { minModelLogBayesFactor: 0 }, { minModelLogBayesFactor: 11 },
    { min: -70, max: -10, initial: 0 }, { unsupportedOption: true }]) {
    assert.throws(() => B.create(options), `reject malformed options: ${JSON.stringify(options)}`);
  }
  for (const response of [null, undefined, 0, 1, 'yes', {}, []]) {
    const state = B.create(DEFAULT_PLAN);
    const before = JSON.stringify(B.summary(state));
    assert.throws(() => B.advance(state, response), 'response must be boolean');
    assert.equal(JSON.stringify(B.summary(state)), before, 'invalid response cannot change posterior');
  }

  const original = B.create(DEFAULT_PLAN);
  const snapshot = JSON.stringify(original);
  const firstSummary = B.summary(original);
  assert.equal(JSON.stringify(original), snapshot, 'summary must be read-only');
  firstSummary.modifiedByCaller = true;
  assert.equal(B.summary(original).modifiedByCaller, undefined, 'summary must not expose its state object');
  firstSummary.uncertainty.lower = 999;
  firstSummary.posterior.modifiedByCaller = true;
  assert.equal(JSON.stringify(original), snapshot, 'summary must not expose nested mutable state');

  for (const [heard, expected] of [[true, 'below_range'], [false, 'above_range']]) {
    const { outcome, trace } = run('bayesian', () => heard);
    assert.equal(outcome.kind, expected);
    assert.equal(outcome.level, heard ? DEFAULT_PLAN.min : DEFAULT_PLAN.max);
    assert.ok(trace.length >= B.DEFAULTS.minTrials, 'boundary outcome needs minimum evidence');
    assert.ok(trace.filter(t => t.level === outcome.level).length >= 2, 'censoring needs direct boundary presentations');
  }

  for (const threshold of [-58, -45, -30, -22]) {
    const { outcome } = run('bayesian', level => level >= threshold);
    assert.equal(outcome.kind, 'estimate', `step threshold ${threshold}`);
    assert.ok(Math.abs(outcome.level - threshold) <= 5, 'ideal-response error <= one staircase step');
    assert.ok(outcome.trials >= B.DEFAULTS.minTrials);
    assert.ok(outcome.uncertainty.width <= B.DEFAULTS.targetWidth + 1e-8);
  }

  // Real calibration windows can have decimal boundaries. Never round a
  // proposed level through the hard cap or below the available output floor.
  const plans = [C.pointPlan(95.04, 7), C.pointPlan(83.23, 7.65),
    { min: -68.37, max: -14.23, initial: -40.71 },
    { min: -31.04, max: -30.01, initial: -30.5 }];
  for (const plan of plans) {
    for (const response of [() => true, () => false, (level, trial) => trial % 2 === 0]) {
      run('bayesian', response, plan);
    }
  }

  // These sequences are independent of stimulus level; narrowing a posterior
  // does not on its own make such a sequence a defensible threshold estimate.
  const inconsistent = run('bayesian', (level, trial) => trial % 2 === 0);
  assert.ok(inconsistent.outcome.trials >= B.DEFAULTS.minTrials, 'alternating responses cannot bypass minimum evidence');
  if (inconsistent.outcome.kind === 'estimate') {
    assert.ok(inconsistent.outcome.uncertainty.width <= B.DEFAULTS.targetWidth,
      'an adaptive alternating sequence may form a valid bracket, but still needs the full precision rule');
  }
  const sequence = Array.from({ length: B.DEFAULTS.maxTrials }, (_, i) => i % 5 !== 0);
  const replayA = run('bayesian', (level, i) => sequence[i]);
  const replayB = run('bayesian', (level, i) => sequence[i]);
  assert.deepEqual(replayA.trace, replayB.trace, 'deterministic stimulus replay');
  assert.deepEqual(replayA.outcome, replayB.outcome, 'deterministic posterior replay');

  // Exercise the page's synchronous response bridge with a real Bayesian
  // state. The response must use the completed presentation snapshot, and a
  // stale request must not enter the posterior.
  const page = fs.readFileSync(path.join(__dirname, 'Tu-do-thinh-luc.html'), 'utf8');
  assert.ok(page.includes('<script src="bayesian-core.js"></script>'));
  assert.ok(page.includes("if(!Number.isFinite(level)||level<bounds.min||level>bounds.max)"));
  assert.ok(page.includes("request!==playbackId"));
  const startFields = {
    startTone: {}, toneMethod: { value: 'bayesian' }, methodBadge: {}, device: { value: 'Synthetic headphones' },
    quiet: { checked: true }, ready: { checked: true }, ears: { value: 'both' }, useCal: { value: 'no' },
    calSame: { checked: false }, noiseMethod: { value: 'self_report' }, noiseDetails: { value: '' },
    result: {}, toneSetup: {}, toneRun: {}
  };
  const toneOrder = [{freq:1000,phase:'primary'},{freq:2000,phase:'primary'},{freq:3000,phase:'primary'},
    {freq:4000,phase:'primary'},{freq:6000,phase:'primary'},{freq:8000,phase:'primary'},
    {freq:1000,phase:'retest'},{freq:500,phase:'primary'},{freq:250,phase:'primary'}];
  const start = { C, B, FREQS:C.FREQS, TONE_ORDER:toneOrder, JSON, session:null, busy:false,
    engineMode:'bayesian', points:[], pointIndex:0, calPlan:null, cal:null, stair:null, catchCountdown:6,
    $:id=>startFields[id], checkIntake:()=>true, alert:message=>{throw Error(message);}, warn:message=>{throw Error(message);},
    stopSound:()=>{}, calGate:()=>{throw Error('uncalibrated test must not call calGate');}, envInfo:()=>({sampleRate:48000,userAgent:'Synthetic'}),
    newStair:()=>B.create(DEFAULT_PLAN), createSession:()=>({type:'tone',status:'in_progress',calibrated:false,unit:'dBFS_peak',trials:[],results:[]}),
    save:()=>{}, lockTabs:()=>{}, renderTone:()=>{}
  };
  vm.createContext(start);
  vm.runInContext(page.slice(page.indexOf("$('startTone').onclick="),page.indexOf('function renderTone(')),start);
  startFields.startTone.onclick();
  assert.equal(start.session.engine.id,'bayesian');assert.equal(start.session.engine.version,B.VERSION);
  assert.equal(start.session.engine.experimental,true);assert.equal(start.session.algorithm,B.VERSION);
  assert.equal(start.points.length,18);assert.equal(start.session.config.ears.length,2);
  assert.equal(start.stair.engine,B.VERSION);assert.equal(startFields.methodBadge.textContent.includes('NGHIÊN CỨU')||startFields.methodBadge.textContent.includes('nghiên cứu'),true);

  const fields = { heard: {}, notHeard: {} }, state = B.create(DEFAULT_PLAN);
  const bridge = {
    B, C, Math, Date, session: { id: 'test-session', type: 'tone', engine: { version: B.VERSION }, trials: [], results: [] },
    waiting: true, pendingPresentation: { ear: 'L', freq: 1000, phase: 'primary', pointIndex: 0,
      sessionId: 'test-session', request: 7, level: state.level, type: 'tone', selection: state.selection,
      startedAt: new Date(Date.now() - 2000).toISOString(), completedAt: new Date(Date.now() - 500).toISOString() },
    playbackId: 7, pointIndex: 0, points: [{ ear: 'L', freq: 1000, phase: 'primary' }],
    stair: state, engineMode: 'bayesian', calPlan: null, catchCountdown: 6,
    $: id => fields[id], save: () => {}, renderTone: () => {}, warn: message => { throw Error(message); },
    finish: () => { throw Error('one response must not finish a Bayesian point'); },
    pointOptions: () => DEFAULT_PLAN, newStair: () => B.create(DEFAULT_PLAN)
  };
  vm.createContext(bridge);
  vm.runInContext(page.slice(page.indexOf('function respond('), page.indexOf("$('heard').onclick=")), bridge);
  bridge.respond(true);
  assert.equal(state.trials, 1);assert.equal(bridge.session.trials.length, 1);
  assert.equal(bridge.session.trials[0].level, DEFAULT_PLAN.initial);
  assert.equal(bridge.session.trials[0].engine, B.VERSION);
  assert.equal(C.validBayesianUncertainty({engine:B.VERSION,kind:'estimate',level:-35,
    uncertainty:{credibleMass:.95,lower:-40,upper:-30,width:10,unit:'dBFS_peak',conditionalOnModel:true},
    posterior:{modelFit:{sufficient:true,comparator:'fair-coin-and-beta-bernoulli-responses',
      minimumForEstimate:Math.log(20),logBayesFactor:4,biasedCoinLogBayesFactor:4}}}),true);
  assert.equal(C.validBayesianUncertainty({engine:B.VERSION,kind:'estimate',level:-35,
    uncertainty:{credibleMass:.95,lower:-40,upper:-30,width:10,unit:'dBFS_peak',conditionalOnModel:true}}),false);
  bridge.waiting = true;bridge.pendingPresentation = { ...bridge.session.trials[0], pointIndex: 0,
    sessionId: 'test-session', request: 6, type: 'tone' };
  bridge.respond(false);assert.equal(state.trials, 1);assert.equal(bridge.session.trials.length, 1);
  bridge.waiting = true;bridge.pendingPresentation = { ear: 'L', freq: 1000, phase: 'primary', pointIndex: 0,
    sessionId: 'test-session', request: 7, type: 'catch', level: state.level,
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  bridge.respond(false);assert.equal(state.trials, 1);assert.equal(bridge.session.trials.at(-1).type, 'catch');

  // Fixed-seed regression thresholds protect useful numerical behavior without
  // presenting a synthetic simulation as evidence of clinical accuracy.
  const report = benchmark(48), scenario = id => report.scenarios.find(s => s.id === id);
  assert.ok(scenario('ideal_step').bayesian.estimateErrorsOnly.maeDb < 2.5);
  assert.ok(scenario('matched_logistic').bayesian.estimateErrorsOnly.maeDb < 3);
  assert.ok(scenario('matched_logistic').bayesian.estimatorYield >= 0.9);
  assert.ok(scenario('matched_logistic').bayesian.posteriorIntervals.coverageAllKnownTruthSessions >= 0.9);
  assert.ok(scenario('shallow_slope').bayesian.posteriorIntervals.coverageAllKnownTruthSessions >= 0.85);
  assert.equal(scenario('broad_thresholds').bayesian.outsideAvailableRange.falselyEstimated, 0);
  assert.ok(scenario('random_responder').bayesian.estimatorYield <= 0.08);

  // The nuisance null is an ordered Bernoulli sequence integrated over p,
  // Beta(h+1,m+1). Check its exact log evidence independently of the engine.
  const audit = replayA.outcome, yes = replayA.trace.filter(t => t.heard).length, no = replayA.trace.length - yes;
  const logFactorial = n => Array.from({length:n}, (_, i) => Math.log(i + 1)).reduce((a,b)=>a+b,0);
  const nullEvidence = logFactorial(yes) + logFactorial(no) - logFactorial(yes + no + 1);
  assert.ok(Math.abs(audit.posterior.modelFit.biasedCoinLogBayesFactor - (audit.posterior.logEvidence - nullEvidence)) < 2e-6);
  assert.equal(inconsistent.outcome.kind, 'inconclusive', 'strict alternation cannot pass the v3 evidence gate');
  const probeState = B.create(DEFAULT_PLAN), methods = [];
  while(!probeState.done){methods.push(probeState.selection.method); B.advance(probeState, probeState.level >= -45);}
  assert.ok(methods.includes('response-consistency-probe'), 'probe policy actually samples response consistency');

  return { passed: true, engine: B.VERSION };
}

const SCENARIOS = [
  { id: 'ideal_step', description: 'Deterministic detection; interior uniform thresholds.', kind: 'step', range: [-60, -20] },
  { id: 'matched_logistic', description: 'A supported model component: logistic scale 3 dB; false positive 0.05, lapse 0.05.', scale: 3, falsePositive: 0.05, lapse: 0.05, range: [-60, -20] },
  { id: 'shallow_slope', description: 'Off-grid shallow responses: scale 7 dB; false positive 0.03, lapse 0.07.', scale: 7, falsePositive: 0.03, lapse: 0.07, range: [-60, -20] },
  { id: 'steep_slope', description: 'Steep responses: scale 0.9 dB; false positive 0.01, lapse 0.03.', scale: 0.9, falsePositive: 0.01, lapse: 0.03, range: [-60, -20] },
  { id: 'high_lapse', description: 'Misspecified lapse 0.15 with logistic scale 3 dB and false positive 0.02.', scale: 3, falsePositive: 0.02, lapse: 0.15, range: [-60, -20] },
  { id: 'false_positive', description: 'Misspecified false positive 0.15 with logistic scale 3 dB and lapse 0.03.', scale: 3, falsePositive: 0.15, lapse: 0.03, range: [-60, -20] },
  { id: 'broad_thresholds', description: 'Uniform thresholds include 12 dB outside each available boundary.', scale: 3, falsePositive: 0.02, lapse: 0.02, range: [-82, 2] },
  { id: 'always_heard', description: 'Behavior stress test; no identifiable generating threshold.', kind: 'constant', probability: 1 },
  { id: 'never_heard', description: 'Behavior stress test; no identifiable generating threshold.', kind: 'constant', probability: 0 },
  { id: 'random_responder', description: 'Independent 50/50 responses; no identifiable generating threshold.', kind: 'constant', probability: 0.5 },
  { id: 'biased_yes', description: 'Independent responses with p(heard)=0.8; no threshold.', kind: 'constant', probability: 0.8 },
  { id: 'biased_no', description: 'Independent responses with p(heard)=0.2; no threshold.', kind: 'constant', probability: 0.2 },
  { id: 'very_shallow', description: 'Outside the slope grid: scale 14 dB, false positive 0.05, lapse 0.10.', scale: 14, falsePositive: 0.05, lapse: 0.10, range: [-60,-20] },
  { id: 'threshold_drift', description: 'Threshold increases by 12 dB after response 16; no single stationary ground truth.', kind:'drift', scale:3, falsePositive:0.05, lapse:0.05, range:[-60,-32] }
];

function wilson(successes, count) {
  if (!count) return null;
  const z=1.959964, p=successes/count, denominator=1+z*z/count;
  const center=(p+z*z/(2*count))/denominator;
  const half=z*Math.sqrt(p*(1-p)/count+z*z/(4*count*count))/denominator;
  return { lower:round(Math.max(0,center-half)), upper:round(Math.min(1,center+half)), method:'Wilson-95-percent' };
}

function aggregate(runs) {
  const counts = { estimate: 0, below_range: 0, above_range: 0, inconclusive: 0 };
  const errors = [], intervalWidths = [], responses = [], coverageAll = [], coverageResolved = [];
  const outsideKinds = { total: 0, correctlyCensored: 0, falselyEstimated: 0 };
  let availableIntervals = 0;
  for (const { threshold, result } of runs) {
    const r = result.outcome;
    counts[r.kind]++;
    responses.push(r.trials);
    if (threshold !== null && r.kind === 'estimate') errors.push(r.level - threshold);
    if (threshold !== null && (threshold < DEFAULT_PLAN.min || threshold > DEFAULT_PLAN.max)) {
      outsideKinds.total++;
      if (r.kind === (threshold < DEFAULT_PLAN.min ? 'below_range' : 'above_range')) outsideKinds.correctlyCensored++;
      if (r.kind === 'estimate') outsideKinds.falselyEstimated++;
    }
    if (r.uncertainty && threshold !== null) {
      const u = r.uncertainty;
      const available = Number.isFinite(u.lower) && Number.isFinite(u.upper);
      const covered = available && threshold >= u.lower && threshold <= u.upper;
      availableIntervals += Number(available);
      coverageAll.push(Number(covered));
      if (r.kind === 'estimate') {
        coverageResolved.push(Number(covered));
        intervalWidths.push(u.width);
      }
    }
  }
  return {
    sessions: runs.length,
    outcomes: counts,
    estimatorYield: round(counts.estimate / runs.length),
    estimatorYieldInterval95: wilson(counts.estimate, runs.length),
    estimateErrorsOnly: { count: errors.length, biasDb: round(mean(errors)),
      maeDb: round(mean(errors.map(Math.abs))), rmseDb: round(errors.length ? Math.sqrt(mean(errors.map(e => e * e))) : null) },
    responsesAllSessions: { mean: round(mean(responses)), min: Math.min(...responses), max: Math.max(...responses) },
    posteriorIntervals: { knownTruthSessions: runs.filter(r => r.threshold !== null).length,
      availableWithKnownTruth: availableIntervals,
      coverageAllKnownTruthSessions: round(mean(coverageAll)),
      coverageInterval95: wilson(coverageAll.reduce((a,b)=>a+b,0), coverageAll.length),
      coverageEstimateSessions: round(mean(coverageResolved)),
      meanWidthEstimateSessionsDb: round(mean(intervalWidths)), conditionalOnModel: true },
    outsideAvailableRange: outsideKinds
  };
}

function benchmark(repetitions = 48, seeds = [SEED]) {
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10000);
  assert.ok(Array.isArray(seeds) && seeds.length > 0 && seeds.every(Number.isInteger));
  const report = {
    schemaVersion: 1,
    engine: B.VERSION,
    seeds,
    repetitionsPerSeed: repetitions,
    repetitionsPerScenario: repetitions * seeds.length,
    plan: DEFAULT_PLAN,
    settings: B.DEFAULTS,
    interpretation: [
      'Synthetic numerical benchmark, not human validation or evidence of clinical accuracy.',
      'Threshold denotes the actual 50%-heard level, including asymmetric response errors; ideal-step thresholds use the detection transition.',
      'MAE and RMSE use estimated sessions only; estimator yield is required to interpret comparisons.',
      'Posterior coverage is reported across all known-truth sessions and separately across estimates; bounds are not measured thresholds.',
      'The baseline has no model-based intervals. Identical seeds provide common response uniforms, but adaptive stimuli differ.',
      'Fixed seeds support regression testing; small scenario samples are not statistical certification.'
    ],
    scenarios: []
  };
  SCENARIOS.forEach((scenario, scenarioIndex) => {
    const runs = { bayesian: [], staircase: [] };
    for (const baseSeed of seeds) for (let i = 0; i < repetitions; i++) {
      const seed = (baseSeed + Math.imul(scenarioIndex + 1, 0x9e3779b1) + Math.imul(i + 1, 0x85ebca6b)) >>> 0;
      const threshold = scenario.range ? scenario.range[0] + random(seed)() * (scenario.range[1] - scenario.range[0]) : null;
      for (const engine of ['bayesian', 'staircase']) {
        const rng = random(seed ^ 0xa5a5a5a5);
        const result = run(engine, (level, trial) => {
          if (scenario.kind === 'step') return level >= threshold;
          const activeThreshold = scenario.kind==='drift' && trial >= 16 ? threshold + 12 : threshold;
          const p = scenario.kind === 'constant' ? scenario.probability : logistic(level, activeThreshold, scenario.scale, scenario.falsePositive, scenario.lapse);
          return rng() < p;
        });
        runs[engine].push({ threshold:scenario.kind==='drift'?null:threshold, result });
      }
    }
    report.scenarios.push({ ...scenario, bayesian: aggregate(runs.bayesian), staircase: aggregate(runs.staircase) });
  });
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  for (const arg of args) assert.ok(['--benchmark', '--write', '--validation'].includes(arg), `unknown option ${arg}`);
  const validation = validate();
  if (args.includes('--benchmark') || args.includes('--write') || args.includes('--validation')) {
    const extended = args.includes('--validation');
    // Seeds fixed before inspecting extended-run results. This is a numerical
    // holdout, not a substitute for a preregistered human validation cohort.
    const report = extended ? benchmark(64, [0x1729abcd, 0x83e61b05, 0xf108d372]) : benchmark();
    if (extended) {
      const find=id=>report.scenarios.find(s=>s.id===id).bayesian;
      for(const id of ['random_responder','biased_yes','biased_no']) assert.ok(find(id).estimatorYield<=0.08, id+' false-estimate regression');
      assert.ok(find('matched_logistic').estimatorYield>=0.75, 'matched model must remain useful');
      assert.ok(find('matched_logistic').posteriorIntervals.coverageAllKnownTruthSessions>=0.9);
      assert.ok(find('shallow_slope').posteriorIntervals.coverageAllKnownTruthSessions>=0.85);
    }
    if (args.includes('--write')) fs.writeFileSync(path.join(__dirname, extended?'bayesian-validation.json':'bayesian-benchmark.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ validation, ...report }, null, 2) + '\n');
  } else {
    console.log(`PASS: Bayesian invariants, boundaries, calibration windows, replay and response-quality checks (${validation.engine}).`);
  }
}

module.exports = { random, logistic, run, validate, benchmark, aggregate, SCENARIOS };
