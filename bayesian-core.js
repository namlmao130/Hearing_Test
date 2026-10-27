/*
 * Experimental, deterministic Bayesian threshold estimation for yes/no tones.
 * No audio or UI side effects. This is a model implementation, not a clinically
 * validated audiometer. Uncertainty is conditional on the model and supplied
 * playback calibration; it does not include calibration or ambient-noise error.
 */
(function (root) {
  'use strict';

  const VERSION = 'bayesian-threshold-v2';
  const DEFAULTS = Object.freeze({
    min: -70, max: -10, initial: -35,
    minTrials: 12, maxTrials: 48, targetWidth: 10, credibleMass: 0.95,
    priorPadding: 30, gridStep: 1, presentationStep: 5, maxUpwardStep: 10,
    boundaryProbability: 0.90, minBoundaryTrials: 4,
    // Guard against a narrow posterior produced by incoherent responses.
    // A final estimate may not be over 10x less likely than fair coin flips.
    minModelLogBayesFactor: -Math.log(10)
  });
  const SLOPES = Object.freeze([1.5, 3, 6]);
  const SLOPE_PRIOR = Object.freeze([0.25, 0.50, 0.25]);
  const ERROR_RATES = Object.freeze([0.01, 0.05, 0.15]);
  const ERROR_PRIOR = Object.freeze([0.55, 0.35, 0.10]);
  const NUISANCES = [];
  for (let i = 0; i < SLOPES.length; i++) {
    for (let j = 0; j < ERROR_RATES.length; j++) {
      for (let k = 0; k < ERROR_RATES.length; k++) {
        const falsePositive = ERROR_RATES[j], lapse = ERROR_RATES[k];
        const midpoint = (0.5 - falsePositive) / (1 - falsePositive - lapse);
        NUISANCES.push(Object.freeze({
          slope: SLOPES[i], falsePositive, lapse,
          shift: Math.log(midpoint / (1 - midpoint)),
          prior: SLOPE_PRIOR[i] * ERROR_PRIOR[j] * ERROR_PRIOR[k]
        }));
      }
    }
  }
  Object.freeze(NUISANCES);
  const PRIVATE = new WeakMap();
  const EPS = 1e-9;
  const precision = x => Math.round(x * 1e8) / 1e8;
  const rounded = (x, digits) => Number(x.toFixed(digits === undefined ? 4 : digits));
  const allowedOptions = new Set(['min', 'max', 'initial', 'minTrials', 'maxTrials',
    'targetWidth', 'credibleMass', 'priorPadding', 'minModelLogBayesFactor']);

  function optionsFor(options) {
    if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
      throw new TypeError('Bayesian options must be an object.');
    }
    const input = options || {};
    for (const key of Object.keys(input)) {
      if (!allowedOptions.has(key)) throw new TypeError('Unknown Bayesian option: ' + key);
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key])) {
        throw new TypeError('Bayesian option ' + key + ' must be a finite number.');
      }
    }
    const o = Object.assign({}, DEFAULTS, input);
    if (o.min < -180 || o.max > 0 || o.max - o.min < 0.1 - EPS) {
      throw new RangeError('Playback range must satisfy -180 <= min < max <= 0 dBFS, with at least 0.1 dB span.');
    }
    if (!Object.prototype.hasOwnProperty.call(input, 'initial')) {
      o.initial = Math.max(o.min, Math.min(o.max, DEFAULTS.initial));
    }
    if (o.initial < o.min || o.initial > o.max) throw new RangeError('Initial level must be within the playback range.');
    if (!Number.isInteger(o.minTrials) || !Number.isInteger(o.maxTrials) ||
        o.minTrials < 12 || o.maxTrials < o.minTrials || o.maxTrials > 96) {
      throw new RangeError('Trial limits must be integers with 12 <= minTrials <= maxTrials <= 96.');
    }
    if (o.targetWidth < 2 || o.targetWidth > 10) throw new RangeError('Target interval width must be between 2 and 10 dB.');
    if (o.credibleMass < 0.95 || o.credibleMass > 0.999) throw new RangeError('Credible mass must be between 0.95 and 0.999.');
    if (o.priorPadding < 20 || o.priorPadding > 60) throw new RangeError('Prior padding must be between 20 and 60 dB.');
    if (o.minModelLogBayesFactor < -10 || o.minModelLogBayesFactor > 10) {
      throw new RangeError('Minimum model log Bayes factor must be between -10 and 10.');
    }
    return Object.freeze(o);
  }

  function getPrivate(state) {
    const data = PRIVATE.get(state);
    if (!data) throw new TypeError('State must be returned by BayesianHearing.create().');
    return data;
  }

  function candidateLevels(o) {
    // All interior levels are on a 5 dB grid anchored to the actual initial
    // level. Include both exact calibrated limits even for fractional ranges.
    const values = [o.min, o.max, o.initial];
    for (let k = Math.ceil((o.min - o.initial) / o.presentationStep);
         k <= Math.floor((o.max - o.initial) / o.presentationStep); k++) {
      const value = precision(o.initial + k * o.presentationStep);
      if (value >= o.min && value <= o.max) values.push(value);
    }
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  function likelihood(data, level) {
    if (data.likelihoods.has(level)) return data.likelihoods.get(level);
    const values = new Float64Array(data.joint.length);
    let index = 0;
    for (const threshold of data.thresholds) {
      for (const nuisance of NUISANCES) {
        // shift ensures threshold is exactly the 50%-heard point, including
        // when the false-positive and lapse probabilities are unequal.
        const z = (level - threshold) / nuisance.slope + nuisance.shift;
        const sigmoid = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
        values[index++] = nuisance.falsePositive + (1 - nuisance.falsePositive - nuisance.lapse) * sigmoid;
      }
    }
    data.likelihoods.set(level, values);
    return values;
  }

  function thresholdMarginal(data) {
    const marginal = new Float64Array(data.thresholds.length);
    const count = NUISANCES.length;
    for (let t = 0; t < marginal.length; t++) {
      for (let n = 0; n < count; n++) marginal[t] += data.joint[t * count + n];
    }
    return marginal;
  }

  function expectedInformation(data, level, marginal) {
    const probabilities = likelihood(data, level);
    const yesMass = new Float64Array(marginal.length);
    const count = NUISANCES.length;
    let probabilityYes = 0;
    for (let t = 0; t < marginal.length; t++) {
      for (let n = 0; n < count; n++) {
        const index = t * count + n;
        yesMass[t] += data.joint[index] * probabilities[index];
      }
      probabilityYes += yesMass[t];
    }
    // I(threshold; response | data, candidate), after marginalizing nuisance
    // parameters. Predictive response entropy alone would overvalue random
    // responses that tell us little about the threshold.
    let information = 0;
    for (let t = 0; t < marginal.length; t++) {
      const p = marginal[t], yes = yesMass[t], no = Math.max(0, p - yes);
      if (yes > 0 && p > 0) information += yes * Math.log2(yes / (p * probabilityYes));
      if (no > 0 && p > 0) information += no * Math.log2(no / (p * (1 - probabilityYes)));
    }
    return Math.max(0, information);
  }

  function chooseLevel(data) {
    const marginal = thresholdMarginal(data);
    let level = data.level, bestInformation = -1;
    for (const candidate of data.candidates) {
      if (candidate > data.level + data.options.maxUpwardStep + EPS) continue;
      const information = expectedInformation(data, candidate, marginal);
      // Deterministic tie-breaking: smaller movement, then quieter level.
      const tied = Math.abs(information - bestInformation) <= 1e-12;
      const closer = Math.abs(candidate - data.level) < Math.abs(level - data.level) - EPS;
      const sameDistance = Math.abs(Math.abs(candidate - data.level) - Math.abs(level - data.level)) <= EPS;
      if (information > bestInformation + 1e-12 || (tied && (closer || (sameDistance && candidate < level)))) {
        bestInformation = information;
        level = candidate;
      }
    }
    data.level = level;
    data.selection = Object.freeze({ method: 'expected-threshold-information',
      expectedInformationBits: rounded(bestInformation, 8) });
  }

  function create(options) {
    const o = optionsFor(options);
    const priorMin = precision(o.min - o.priorPadding);
    const bins = Math.ceil((o.max + o.priorPadding - priorMin) / o.gridStep);
    const thresholds = new Float64Array(bins + 1);
    const joint = new Float64Array(thresholds.length * NUISANCES.length);
    for (let t = 0; t < thresholds.length; t++) {
      thresholds[t] = precision(priorMin + t * o.gridStep);
      for (let n = 0; n < NUISANCES.length; n++) joint[t * NUISANCES.length + n] = NUISANCES[n].prior / thresholds.length;
    }
    const data = { options: o, thresholds, joint, candidates: candidateLevels(o),
      likelihoods: new Map(), level: o.initial, trials: 0, done: false,
      observations: [], logEvidence: 0, outcome: null, selection: null };
    data.selection = Object.freeze({ method: 'fixed-initial',
      expectedInformationBits: rounded(expectedInformation(data, data.level, thresholdMarginal(data)), 8) });
    const state = {};
    for (const key of ['level', 'trials', 'done', 'selection']) {
      Object.defineProperty(state, key, { enumerable: true, get: () => data[key] });
    }
    for (const key of ['min', 'max', 'initial', 'maxTrials']) {
      Object.defineProperty(state, key, { enumerable: true, value: o[key] });
    }
    Object.defineProperty(state, 'engine', { enumerable: true, value: VERSION });
    Object.defineProperty(state, 'policy', { enumerable: true, value: o });
    PRIVATE.set(state, data);
    return Object.freeze(state);
  }

  function quantile(data, marginal, probability) {
    let total = 0;
    for (let t = 0; t < marginal.length; t++) {
      total += marginal[t];
      if (total >= probability) return data.thresholds[t];
    }
    return data.thresholds[data.thresholds.length - 1];
  }

  function snapshot(data) {
    const marginal = thresholdMarginal(data);
    const median = quantile(data, marginal, 0.5);
    const tail = (1 - data.options.credibleMass) / 2;
    const lower = quantile(data, marginal, tail), upper = quantile(data, marginal, 1 - tail);
    let mean = 0, entropy = 0, below = 0, above = 0, map = 0;
    let slopeMean = 0, lapseMean = 0, falsePositiveMean = 0;
    let heard = 0, missesBelow = 0, heardAbove = 0;
    const floor = [], ceiling = [];
    for (let t = 0; t < marginal.length; t++) {
      mean += data.thresholds[t] * marginal[t];
      if (marginal[t] > 0) entropy -= marginal[t] * Math.log2(marginal[t]);
      if (marginal[t] > marginal[map]) map = t;
      if (data.thresholds[t] < data.options.min - EPS) below += marginal[t];
      if (data.thresholds[t] > data.options.max + EPS) above += marginal[t];
      for (let n = 0; n < NUISANCES.length; n++) {
        const weight = data.joint[t * NUISANCES.length + n], nuisance = NUISANCES[n];
        slopeMean += weight * nuisance.slope;
        lapseMean += weight * nuisance.lapse;
        falsePositiveMean += weight * nuisance.falsePositive;
      }
    }
    for (const observation of data.observations) {
      if (observation.heard) heard++;
      if (!observation.heard && observation.level <= median + EPS && observation.level >= median - 15 - EPS) missesBelow++;
      if (observation.heard && observation.level >= median - EPS && observation.level <= median + 15 + EPS) heardAbove++;
      if (observation.level === data.options.min) floor.push(observation.heard);
      if (observation.level === data.options.max) ceiling.push(observation.heard);
    }
    const boundaryStats = values => ({ trials: values.length, heard: values.filter(Boolean).length,
      missed: values.filter(value => !value).length, lastThree: values.slice(-3) });
    return {
      level: median,
      trials: data.trials,
      engine: VERSION,
      uncertainty: { credibleMass: data.options.credibleMass, lower, upper,
        width: precision(upper - lower), unit: 'dBFS_peak', conditionalOnModel: true },
      posterior: {
        model: 'logistic-50-percent-joint-nuisance-grid', thresholdDefinition: '50%-heard',
        median, mean: rounded(mean), map: data.thresholds[map], entropyBits: rounded(entropy, 6),
        belowRangeProbability: rounded(below, 8), aboveRangeProbability: rounded(above, 8),
        prior: { kind: 'discrete-uniform', lower: data.thresholds[0],
          upper: data.thresholds[data.thresholds.length - 1], gridStep: data.options.gridStep },
        nuisance: { slopeMean: rounded(slopeMean), falsePositiveMean: rounded(falsePositiveMean, 6),
          lapseMean: rounded(lapseMean, 6), slopeGrid: [...SLOPES], errorRateGrid: [...ERROR_RATES] },
        observations: { heard, missed: data.trials - heard },
        bracket: { missesBelow, heardAbove, sufficient: missesBelow >= 2 && heardAbove >= 2, windowDb: 15 },
        boundary: { floor: boundaryStats(floor), ceiling: boundaryStats(ceiling) },
        logEvidence: rounded(data.logEvidence, 6),
        modelFit: {
          comparator: 'independent-fair-coin-responses',
          logBayesFactor: rounded(data.logEvidence + data.trials * Math.log(2), 6),
          minimumForEstimate: rounded(data.options.minModelLogBayesFactor, 6),
          sufficient: data.logEvidence + data.trials * Math.log(2) >= data.options.minModelLogBayesFactor
        },
        conditionalOnModel: true
      }
    };
  }

  function summary(state) {
    // Return detached ordinary objects: callers cannot mutate the inference
    // state by editing the audit summary or a persisted result.
    return snapshot(getPrivate(state));
  }

  function finish(data, kind, level, stopReason, info) {
    data.done = true;
    data.outcome = Object.assign({}, info, { kind, level, stopReason });
    // A new detached result is returned on completion. Later advance calls are
    // rejected so an accidental double click cannot add another observation.
    return data.outcome;
  }

  function advance(state, heard) {
    const data = getPrivate(state);
    if (typeof heard !== 'boolean') throw new TypeError('A tone response must be a boolean.');
    if (data.done) throw new Error('This Bayesian point has already stopped.');
    const probabilities = likelihood(data, data.level);
    let evidence = 0;
    for (let i = 0; i < data.joint.length; i++) {
      data.joint[i] *= heard ? probabilities[i] : (1 - probabilities[i]);
      evidence += data.joint[i];
    }
    if (!Number.isFinite(evidence) || evidence <= 0) throw new Error('Bayesian probability normalization failed.');
    for (let i = 0; i < data.joint.length; i++) data.joint[i] /= evidence;
    data.logEvidence += Math.log(evidence);
    data.observations.push({ level: data.level, heard });
    data.trials++;
    const info = snapshot(data), p = info.posterior, o = data.options;
    if (data.trials >= o.minTrials) {
      const floor = p.boundary.floor, ceiling = p.boundary.ceiling;
      if (floor.heard >= o.minBoundaryTrials && floor.heard / floor.trials >= 0.8 &&
          floor.lastThree.length === 3 && floor.lastThree.every(Boolean) &&
          p.belowRangeProbability >= o.boundaryProbability) {
        return finish(data, 'below_range', o.min, 'posterior-and-repeated-floor-responses', info);
      }
      if (ceiling.missed >= o.minBoundaryTrials && ceiling.missed / ceiling.trials >= 0.8 &&
          ceiling.lastThree.length === 3 && ceiling.lastThree.every(value => !value) &&
          p.aboveRangeProbability >= o.boundaryProbability) {
        return finish(data, 'above_range', o.max, 'posterior-and-repeated-ceiling-misses', info);
      }
      if (info.uncertainty.width <= o.targetWidth + EPS &&
          info.uncertainty.lower >= o.min && info.uncertainty.upper <= o.max &&
          p.bracket.sufficient && p.modelFit.sufficient) {
        return finish(data, 'estimate', info.level, 'credible-interval-and-response-bracket', info);
      }
    }
    if (data.trials >= o.maxTrials) return finish(data, 'inconclusive', null, 'maximum-trials-without-required-evidence', info);
    chooseLevel(data);
    return null;
  }

  function replay(options, responses) {
    if (!Array.isArray(responses) || responses.some(response => typeof response !== 'boolean')) {
      throw new TypeError('Replay requires an array of boolean tone responses.');
    }
    const state = create(options);
    let outcome = null;
    for (const response of responses) outcome = advance(state, response);
    return outcome || Object.assign({}, summary(state), { kind: 'running', nextLevel: state.level });
  }

  const api = Object.freeze({ VERSION, DEFAULTS, create, advance, summary, replay });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BayesianHearing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
