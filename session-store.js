/* Local-only session persistence. No audio, network or DOM side effects. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./hearing-core.js') : root.HearingCore;
  const MAX_BYTES = 10 * 1024 * 1024, MAX_SESSIONS = 1000;
  const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const text = (x, max = 500) => typeof x === 'string' && x.length <= max;
  const date = x => text(x, 80) && Number.isFinite(Date.parse(x));
  const level = x => Number.isFinite(x) && x >= -300 && x <= 300;
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const clone = value => JSON.parse(JSON.stringify(value));

  function validateSession(s) {
    check(record(s) && s.schemaVersion === 1, 'Phiên không đúng phiên bản dữ liệu 1.');
    check(text(s.id, 160) && s.id.trim(), 'Thiếu mã phiên.');
    check(['tone', 'speech'].includes(s.type), 'Loại bài đo không hợp lệ.');
    check(['in_progress', 'interrupted', 'completed', 'stopped', 'error'].includes(s.status), 'Trạng thái phiên không hợp lệ.');
    check(date(s.startedAt), 'Ngày bắt đầu không hợp lệ.');
    if (s.endedAt !== undefined) check(date(s.endedAt) && Date.parse(s.endedAt) >= Date.parse(s.startedAt), 'Ngày kết thúc không hợp lệ.');
    if (['completed', 'stopped', 'error'].includes(s.status)) check(date(s.endedAt), 'Thiếu ngày kết thúc.');
    check(typeof s.calibrated === 'boolean', 'Thiếu trạng thái hiệu chuẩn.');
    check(Array.isArray(s.trials) && s.trials.length <= 20000 && Array.isArray(s.results) && s.results.length <= 2000, 'Danh sách lượt/kết quả không hợp lệ hoặc quá lớn.');
    for (const field of ['algorithm', 'device', 'appVersion']) if (s[field] !== undefined) check(text(s[field], 2000), 'Thông tin phiên không hợp lệ.');
    if (s.engine !== undefined) {
      check(record(s.engine), 'Thông tin thuật toán không hợp lệ.');
      for (const field of ['id', 'version']) if (s.engine[field] !== undefined) check(text(s.engine[field]), 'Phiên bản thuật toán không hợp lệ.');
    }
    if (s.config !== undefined) check(record(s.config), 'Cấu hình phiên không hợp lệ.');
    if (s.config?.ears !== undefined) check(Array.isArray(s.config.ears) && s.config.ears.length > 0 && s.config.ears.length <= 2 && s.config.ears.every(e => ['L', 'R'].includes(e)), 'Danh sách tai không hợp lệ.');
    if (s.type === 'tone') {
      check(s.unit === (s.calibrated ? 'dB_HL' : 'dBFS_peak'), 'Đơn vị không khớp trạng thái hiệu chuẩn.');
      if (s.calibrated) check(record(s.calibration?.profile) && text(s.calibration.profile.transducer) && date(s.calibration.profile.expiresAt), 'Thiếu hồ sơ hiệu chuẩn của phiên.');
      const point = p => {
        check(record(p) && ['L', 'R'].includes(p.ear) && C.FREQS.includes(p.freq) && ['primary', 'retest'].includes(p.phase), 'Điểm đo không hợp lệ.');
        if (p.engine !== undefined) check(text(p.engine), 'Phiên bản tại điểm đo không hợp lệ.');
      };
      for (const trial of s.trials) {
        point(trial);
        check(['tone', 'catch'].includes(trial.type) && typeof trial.heard === 'boolean', 'Phản hồi âm đơn không hợp lệ.');
        check(trial.type === 'catch' ? trial.level === null : level(trial.level) && trial.level <= 0, 'Mức phát không hợp lệ.');
      }
      const seen = new Set();
      for (const result of s.results) {
        point(result);
        const key = `${result.ear}/${result.freq}/${result.phase}`;
        check(!seen.has(key), 'Trùng điểm đo trong một phiên.'); seen.add(key);
        check(['estimate', 'below_range', 'above_range', 'inconclusive'].includes(result.kind), 'Loại kết quả không hợp lệ.');
        check(result.kind === 'inconclusive' ? result.level === null : level(result.level) && result.level <= 0, 'Ngưỡng không hợp lệ.');
        check(Number.isInteger(result.trials) && result.trials > 0 && result.trials <= 96, 'Số lượt tại điểm đo không hợp lệ.');
        if (result.hl != null) check(level(result.hl), 'Ngưỡng dB HL không hợp lệ.');
        for (const field of ['uncertainty', 'uncertaintyHL']) {
          const u = result[field];
          if (u != null) check(record(u) && level(u.lower) && level(u.upper) && u.lower <= u.upper && Number.isFinite(u.width) && Math.abs(u.width - (u.upper - u.lower)) < 0.11, 'Khoảng bất định không hợp lệ.');
        }
      }
      // Run the same derived checks used by the report, without trusting any
      // saved classification. A malformed nested object must not reach the UI.
      C.assessToneQuality(s.results, s.trials, s.config?.ears);
      C.whoReport(s);
    } else {
      check(s.unit === 'dB_SNR' && !s.calibrated, 'Đơn vị bài lời nói không hợp lệ.');
      for (const trial of s.trials) check(record(trial) && typeof trial.correct === 'boolean' && level(trial.snr) && text(trial.answer, 10000) && text(trial.expected, 10000), 'Phản hồi lời nói không hợp lệ.');
      for (const result of s.results) check(record(result) && Number.isInteger(result.sentence) && result.sentence > 0 && typeof result.correct === 'boolean' && level(result.snr), 'Kết quả lời nói không hợp lệ.');
    }
    return s;
  }

  function parse(raw) {
    check(typeof raw === 'string' && raw.length <= MAX_BYTES, 'Dữ liệu JSON quá lớn hoặc không phải văn bản.');
    let nodes = 0;
    const value = JSON.parse(raw, (key, value) => {
      check(++nodes <= 500000 && !['__proto__', 'constructor', 'prototype'].includes(key), 'Cấu trúc JSON không được hỗ trợ.');
      check(typeof value !== 'number' || Number.isFinite(value), 'JSON chứa số không hữu hạn.');
      return value;
    });
    return value;
  }

  function decode(raw, allowSingle = false) {
    const value = parse(raw), sessions = Array.isArray(value) ? value : allowSingle ? [value] : null;
    check(sessions && sessions.length <= MAX_SESSIONS, 'Cần danh sách phiên hợp lệ (tối đa 1.000 phiên).');
    const valid = [], rejected = [], seen = new Set();
    sessions.forEach((s, index) => {
      try {
        validateSession(s);
        check(!seen.has(s.id), 'Trùng mã phiên.');
        seen.add(s.id); valid.push(s);
      } catch (e) { rejected.push({ index, reason: e.message }); }
    });
    return { sessions: valid, rejected };
  }

  function interrupt(sessions) {
    return sessions.map(s => s.status === 'in_progress' ? { ...s, status: 'interrupted', interruptionReason: 'page-reloaded-or-imported' } : s);
  }

  function merge(existing, raw) {
    const decoded = decode(raw, true);
    check(!decoded.rejected.length, decoded.rejected[0]?.reason || 'Dữ liệu không hợp lệ.');
    const result = clone(existing), byId = new Map(result.map(s => [s.id, s]));
    for (const s of interrupt(decoded.sessions)) {
      if (byId.has(s.id)) {
        // Never replace an existing clinical/audit record silently on import.
        check(fingerprint(byId.get(s.id)) === fingerprint(s), 'Mã phiên đã có nhưng nội dung khác; không ghi đè.');
      } else { result.push(s); byId.set(s.id, s); }
    }
    check(result.length <= MAX_SESSIONS, 'Lịch sử vượt 1.000 phiên. Hãy xuất và quản lý các phiên cũ.');
    return result.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }

  function fingerprint(session) {
    // JSON key order and recomputed report labels do not change the evidence.
    const copy = clone(session);
    for (const key of ['interpretation', 'quality', 'interruptionReason']) delete copy[key];
    const sorted = value => Array.isArray(value) ? value.map(sorted) : record(value) ?
      Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    return JSON.stringify(sorted(copy));
  }

  function create(storage, key) {
    let expectedRaw = null, loaded = false, blocked = false;
    function load() {
      try {
        expectedRaw = storage.getItem(key);
        const result = decode(expectedRaw === null ? '[]' : expectedRaw);
        blocked = result.rejected.length > 0; loaded = true;
        return { ...result, sessions: interrupt(result.sessions), blocked,
          message: blocked ? 'Có phiên bị lỗi. Dữ liệu gốc được giữ nguyên; lịch sử chỉ đọc. Hãy tải dữ liệu gốc và xuất các phiên mới.' : '' };
      } catch (e) {
        blocked = true; loaded = true;
        return { sessions: [], rejected: [], blocked, message: 'Không đọc được lịch sử. Không ghi đè dữ liệu gốc. ' + e.message };
      }
    }
    function write(sessions) {
      try {
        check(loaded && !blocked, 'Lịch sử đang chỉ đọc. Hãy xuất JSON để giữ các phiên mới.');
        const raw = JSON.stringify(sessions), checked = decode(raw);
        check(checked.rejected.length === 0, checked.rejected[0]?.reason || 'Dữ liệu không hợp lệ.');
        if (storage.getItem(key) !== expectedRaw) {
          blocked = true;
          throw Error('Lịch sử đã thay đổi ở trang khác. Hãy xuất phiên hiện tại rồi tải lại trang; không ghi đè.');
        }
        // setItem is atomic on failure (including QuotaExceededError); never
        // remove the old key first. No extra copy doubles quota consumption.
        storage.setItem(key, raw); expectedRaw = raw;
        return { ok: true };
      } catch (e) { return { ok: false, message: 'Chưa lưu được: ' + e.message + ' Hãy tải JSON.' }; }
    }
    return Object.freeze({ load, write, original: () => expectedRaw, get blocked() { return blocked; } });
  }
  const api = Object.freeze({ MAX_BYTES, MAX_SESSIONS, validateSession, decode, merge, create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HearingSessionStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
