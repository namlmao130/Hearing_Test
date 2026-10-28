(function () {
  'use strict';

// ============================================================================
  // 1. GLOBAL STATE & SCENARIO DATA
  // ============================================================================
  const FREQS = [250, 500, 1000, 2000, 4000, 8000];
  const LEVEL_PRESETS = {
    Normal:   [10, 10, 10, 15, 15, 15],
    Mild:     [15, 20, 25, 35, 40, 45],
    Moderate: [25, 35, 45, 55, 65, 70],
    Severe:   [55, 65, 75, 85, 95, 100]
  };

  const SCENARIOS = {
    shopping: {
      en: "Alright, you're all set. Your total is $27.60.\n\nIs that going to be... card, or?\n\nYeah, can I put it on the card?\n\nSure. Of course. Let me get that run through for you, here.\nAlright, and you want the receipt in the bag?\n\nYeah, that's fine.\n\nOK, that is great.\n\nAlright, thanks so much.\n\nHave a great day.\n\nYou too.",
      vi: "Vâng, của bác xong hết rồi ạ. Tổng cộng hóa đơn là 276 nghìn.\n\nBác muốn thanh toán bằng thẻ hay tiền mặt ạ?\n\nCho bác quẹt thẻ nhé.\n\nDạ vâng. Để cháu quẹt thẻ giúp bác ngay đây.\nBác có muốn bỏ hóa đơn vào trong túi luôn không ạ?\n\nỪ, cứ để vào túi cho bác.\n\nDạ xong rồi, cảm ơn bác rất nhiều. Chúc bác một ngày tốt lành!",
      noiseFreq: 1800, noiseQ: 1.2
    },
    conversation: {
      en: "Did you hear that Sarah is moving to Seattle next month?\n\nReally? I thought she just bought a house here.\n\nShe did, but she got a promotion she couldn't refuse.",
      vi: "Bố ơi, cuối tuần này vợ chồng con đưa hai cháu về quê thăm bố mẹ nhé.\n\nThế à? Các con về hôm thứ Bảy hay Chủ Nhật?\n\nDạ sáng thứ Bảy tụi con xuất phát sớm để kịp ăn trưa cùng bố mẹ ạ.",
      noiseFreq: 600, noiseQ: 0.7
    },
    meeting: {
      en: "Let's review the third quarter forecast before we finalize the budget.\n\nShould we prioritize the software security patch first?\n\nYes, security and client retention are our top priorities.",
      vi: "Chúng ta hãy rà soát lại tiến độ dự án trước khi chốt ngân sách quý ba.\n\nMình có nên ưu tiên vá lỗi bảo mật hệ thống trước không?\n\nĐúng vậy, bảo mật và trải nghiệm khách hàng là ưu tiên số một.",
      noiseFreq: 1000, noiseQ: 1.0
    },
    restaurant: {
      en: "Excuse me, could we get some extra napkins and the check please?\n\nCertainly! Would you like to see the dessert menu first?\n\nNo thanks, we're in a bit of a hurry tonight.",
      vi: "Em ơi, cho bàn anh xin thêm ít khăn giấy và thanh toán hóa đơn luôn nhé!\n\nDạ vâng! Anh chị có muốn dùng thêm tráng miệng trước không ạ?\n\nCảm ơn em, tối nay nhà anh hơi vội nên tính tiền luôn giúp anh.",
      noiseFreq: 1400, noiseQ: 0.6
    },
    crowd: {
      en: "Stay close to the entrance! It's getting really crowded over there.\n\nWhere did you park the car? Section B or Section C?\n\nSection C, right next to the station exit!",
      vi: "Đứng gần cổng chính thôi nhé! Bên kia đang đông người lắm.\n\nHồi nãy mình gửi xe ở khu B hay khu C nhỉ?\n\nKhu C, ngay sát lối ra trạm xe buýt ấy!",
      noiseFreq: 900, noiseQ: 0.5
    },
    car: {
      en: "Take the next exit on the right, then turn left at the traffic light.\n\nDid you say turn left or go straight?\n\nTurn left right after the gas station.",
      vi: "Rẽ phải ở lối ra tiếp theo, sau đó rẽ trái ngay ngã tư đèn xanh đèn đỏ nhé.\n\nCon bảo rẽ trái hay đi thẳng cơ?\n\nRẽ trái ngay sau trạm xăng phía trước ấy bố ạ.",
      noiseFreq: 220, noiseQ: 2.0
    },
    music: {
      en: "Listen to the high violin notes blending with the soft flute melody.\n\nWhen high frequencies fade, music loses its sparkle and warmth.",
      vi: "Hãy lắng nghe tiếng đàn violin vút cao hòa quyện cùng tiếng sáo trúc.\n\nKhi mất dải tần số cao, bản nhạc sẽ mất đi độ trong trẻo và sắc thái.",
      noiseFreq: 3200, noiseQ: 1.5
    }
  };

  const SOUND_ITEMS = [
    { id: "water", emoji: "🚰", label: "Vòi nước (20dB)", freq: 250, db: 20 },
    { id: "ph_low", text: "z v j m d b n ng e u", label: "Nguyên âm & Âm trầm", freq: 380, db: 42 },
    { id: "ph_mid", text: "p h ch g k t", label: "Phụ âm trung-cao", freq: 1800, db: 28 },
    { id: "ph_high", text: "f s th x", label: "Phụ âm xát tần số cao", freq: 5500, db: 22 },
    { id: "talk", emoji: "🧑‍🤝‍🧑", label: "Trò chuyện (45dB)", freq: 1000, db: 45 },
    { id: "birds", emoji: "🐦", label: "Chim hót (15dB)", freq: 4500, db: 15 },
    { id: "dog", emoji: "🐕", label: "Chó sủa (70dB)", freq: 320, db: 70 },
    { id: "vacuum", emoji: "🧹", label: "Máy hút bụi (60dB)", freq: 2600, db: 60 },
    { id: "piano", emoji: "🎹", label: "Đàn Piano (80dB)", freq: 1000, db: 80 },
    { id: "truck", emoji: "🚚", label: "Xe tải (95dB)", freq: 250, db: 98 },
    { id: "firework", emoji: "🎆", label: "Pháo hoa (105dB)", freq: 550, db: 105 },
    { id: "plane", emoji: "✈️", label: "Máy bay (105dB)", freq: 3600, db: 105 },
    { id: "moto", emoji: "🏍️", label: "Mô tô (100dB)", freq: 7200, db: 98 }
  ];

  let state = {
    lang: "en",
    scenario: "shopping",
    level: "Normal",
    audiogramMode: "SOUNDS",
    thresholds: [...LEVEL_PRESETS.Normal], // 6 frequencies
    isPlaying: false
  };

  // ============================================================================
  // 2. PHONEME VISUAL DEGRADATION ENGINE (MẤT CHỮ THEO TẦN SỐ ÂM VỊ)
  // ============================================================================
  function renderDegradedText() {
    const rawText = SCENARIOS[state.scenario][state.lang];
    const container = document.getElementById("vizTextContainer");
    const lvl = state.level;

    if (lvl === "Normal") {
      container.textContent = rawText;
      return;
    }

    const mildSet = new Set("sfzxvSFZXV");
    const modSet = new Set("tkcpgdhbđqTKCPGDHBĐQ");
    const sevSet = new Set("mnlrwjyMNLRWJY0123456789");

    let html = "";
    let i = 0;
    while (i < rawText.length) {
      const twoChars = rawText.substr(i, 2).toLowerCase();
      const threeChars = rawText.substr(i, 3).toLowerCase();

      if (threeChars === "ght" && (lvl === "Moderate" || lvl === "Severe")) {
        html += `<span style="opacity:0">   </span>`;
        i += 3;
        continue;
      }
      if (["th", "sh", "ph", "kh"].includes(twoChars)) {
        html += `<span style="opacity:0">  </span>`;
        i += 2;
        continue;
      }
      if (["ch", "tr", "gh"].includes(twoChars) && (lvl === "Moderate" || lvl === "Severe")) {
        html += `<span style="opacity:0">  </span>`;
        i += 2;
        continue;
      }

      const ch = rawText[i];
      if (lvl === "Mild" && mildSet.has(ch)) {
        html += `<span style="opacity:0">&nbsp;</span>`;
      } else if (lvl === "Moderate" && (mildSet.has(ch) || modSet.has(ch))) {
        html += `<span style="opacity:0">&nbsp;</span>`;
      } else if (lvl === "Severe") {
        if (mildSet.has(ch) || modSet.has(ch) || sevSet.has(ch)) {
          html += `<span style="opacity:0">&nbsp;</span>`;
        } else {
          html += `<span class="char-fade-sev">${ch}</span>`;
        }
      } else {
        html += ch === "\n" ? "<br/>" : ch;
      }
      i++;
    }
    container.innerHTML = html;
  }

  function setLossLevel(levelName, idx) {
    state.level = levelName;
    state.thresholds = [...LEVEL_PRESETS[levelName]];
    document.querySelectorAll(".level-node").forEach((el, i) => {
      el.classList.toggle("active", i === idx);
    });
    renderDegradedText();
    renderAudiogram();
    updateAudioFilterLive();
  }

  function updateScenario() {
    state.scenario = document.getElementById("scenarioSelect").value;
    renderDegradedText();
    if (state.isPlaying) {
      stopAudioSimulation();
      startAudioSimulation();
    }
  }

  function toggleLanguage() {
    state.lang = state.lang === "en" ? "vi" : "en";
    renderDegradedText();
  }

  // ============================================================================
  // 3. WEB AUDIO API DSP + NOISE SIMULATOR
  // ============================================================================
  let audioCtx = null;
  let noiseNode = null;
  let noiseGain = null;
  let lowpassFilter = null;

  function getCutoffFreqForLevel(lvl) {
    if (lvl === "Normal") return 8000;
    if (lvl === "Mild") return 2600;
    if (lvl === "Moderate") return 1100;
    return 420;
  }

  function getNoiseGainForLevel(lvl) {
    if (lvl === "Normal") return 0.03;
    if (lvl === "Mild") return 0.12;
    if (lvl === "Moderate") return 0.28;
    return 0.45;
  }

  function toggleAudioSimulation() {
    if (state.isPlaying) {
      stopAudioSimulation();
    } else {
      startAudioSimulation();
    }
  }

  let demoBuffer = null, speechNode = null, speechGain = null, filterBank = [], demoNodes = [], demoGeneration = 0;
  async function loadDemoAudio(event) {
    stopAudioSimulation(); demoBuffer = null;
    const file = event.target.files[0], generation = ++demoGeneration;
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("File quá lớn, tối đa 20 MB.");
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(await file.arrayBuffer());
      if (generation !== demoGeneration) return;
      if (decoded.duration > 120) throw Error("Chọn đoạn âm thanh không quá 120 giây.");
      demoBuffer = decoded;
      document.getElementById("audioStatus").textContent = "Sẵn sàng: " + file.name;
    } catch (e) { document.getElementById("audioStatus").textContent = e.message; }
  }
  async function startAudioSimulation() {
    if (!demoBuffer) { document.getElementById("audioStatus").textContent = "Hãy chọn file giọng nói trước khi phát."; return; }
    stopAudioSimulation();
    const generation = demoGeneration;
    if (audioCtx.state === "suspended") await audioCtx.resume();
    if (generation !== demoGeneration || audioCtx.state !== "running") return;
    const size = audioCtx.sampleRate * 3, buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<size;i++) data[i] = Math.random()*2-1;
    noiseNode = audioCtx.createBufferSource(); noiseNode.buffer = buffer; noiseNode.loop = true;
    const bandpass = audioCtx.createBiquadFilter(); bandpass.type = "bandpass";
    bandpass.frequency.value = SCENARIOS[state.scenario].noiseFreq; bandpass.Q.value = SCENARIOS[state.scenario].noiseQ;
    noiseGain = audioCtx.createGain(); noiseNode.connect(bandpass); bandpass.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    speechNode = audioCtx.createBufferSource(); speechNode.buffer = demoBuffer;
    let previous = speechNode;
    filterBank = FREQS.map(freq => { const f = audioCtx.createBiquadFilter(); f.type="peaking"; f.frequency.value=freq; f.Q.value=1.4; previous.connect(f); previous=f; return f; });
    speechGain = audioCtx.createGain(); speechGain.gain.value = 0.18;
    previous.connect(speechGain); speechGain.connect(audioCtx.destination);
    demoNodes = [bandpass, noiseGain, ...filterBank, speechGain];
    speechNode.onended = () => { if(generation === demoGeneration) stopAudioSimulation(); };
    updateAudioFilterLive(); noiseNode.start(); speechNode.start(); state.isPlaying=true;
    document.getElementById("playBtn").textContent="⏸";
    document.getElementById("audioStatus").textContent="Đang lọc file giọng nói theo 6 điểm biểu đồ · mô phỏng gần đúng";
  }
  function updateAudioFilterLive() {
    filterBank.forEach((f,i) => f.gain.setTargetAtTime(-Math.max(0,Math.min(36,(state.thresholds[i]-10)*0.45)),audioCtx.currentTime,0.06));
    if(noiseGain && audioCtx) noiseGain.gain.setTargetAtTime(getNoiseGainForLevel(state.level)*0.12,audioCtx.currentTime,0.06);
  }
  function stopAudioSimulation() {
    demoGeneration++;
    for(const source of [noiseNode,speechNode]) { if(source) { source.onended=null; try{source.stop();}catch(e){} source.disconnect(); } }
    demoNodes.forEach(node=>node.disconnect()); demoNodes=[]; filterBank=[];
    noiseNode=speechNode=noiseGain=speechGain=null; state.isPlaying=false;
    document.getElementById("playBtn").textContent="▶";
    document.getElementById("audioStatus").textContent="Chọn file âm thanh rồi bấm ▶ để nghe mô phỏng";
  }
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) stopAudioSimulation(); });

  // ============================================================================
  // 4. INTERACTIVE AUDIOGRAM
  // ============================================================================
  function freqToX(freq) {
    const minLog = Math.log2(200);
    const maxLog = Math.log2(9000);
    return ((Math.log2(freq) - minLog) / (maxLog - minLog)) * 410 + 20;
  }

  function dbToY(db) {
    return ((db + 10) / 120) * 285 + 20;
  }

  function yToDb(y) {
    let db = ((y - 20) / 285) * 120 - 10;
    return Math.max(-10, Math.min(110, Math.round(db / 5) * 5));
  }

  function getUserThresholdAt(freq) {
    if (freq <= FREQS[0]) return state.thresholds[0];
    if (freq >= FREQS[FREQS.length - 1]) return state.thresholds[FREQS.length - 1];
    for (let i = 0; i < FREQS.length - 1; i++) {
      if (freq >= FREQS[i] && freq <= FREQS[i + 1]) {
        const t = (Math.log2(freq) - Math.log2(FREQS[i])) / (Math.log2(FREQS[i + 1]) - Math.log2(FREQS[i]));
        return state.thresholds[i] + t * (state.thresholds[i + 1] - state.thresholds[i]);
      }
    }
    return 20;
  }

  function setAudiogramMode(mode) {
    state.audiogramMode = mode;
    document.getElementById("modePlotsBtn").classList.toggle("active", mode === "PLOTS");
    document.getElementById("modeSoundsBtn").classList.toggle("active", mode === "SOUNDS");
    renderAudiogram();
  }

  function playSampleTone(freq, db) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    const now = audioCtx.currentTime;
    const amplitude = Math.min(0.08, 0.005 * Math.pow(10, Math.max(0, db) / 100));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amplitude, now + 0.025);
    g.gain.setValueAtTime(amplitude, now + 0.30);
    g.gain.linearRampToValueAtTime(0, now + 0.35);
    osc.onended=()=>{osc.disconnect();g.disconnect();};
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  }

  function renderAudiogram() {
    const svg = document.getElementById("audiogramSvg");
    const overlay = document.getElementById("soundOverlayLayer");
    svg.innerHTML = "";
    overlay.innerHTML = "";

    for (let db = 0; db <= 110; db += 10) {
      const y = dbToY(db);
      svg.innerHTML += `<line x1="15" y1="${y}" x2="440" y2="${y}" stroke="#DCE8D5" stroke-width="1" />`;
      if (db % 20 === 0) {
        svg.innerHTML += `<text x="-18" y="${y + 4}" font-size="10" fill="#6C786A" font-weight="600">${db}</text>`;
      }
    }

    FREQS.forEach(f => {
      const x = freqToX(f);
      svg.innerHTML += `<line x1="${x}" y1="15" x2="${x}" y2="310" stroke="#DCE8D5" stroke-width="1" />`;
      svg.innerHTML += `<text x="${x}" y="8" font-size="10" text-anchor="middle" fill="#6C786A" font-weight="700">${f}</text>`;
    });

    let pointsAttr = FREQS.map((f, idx) => `${freqToX(f)},${dbToY(state.thresholds[idx])}`).join(" ");
    svg.innerHTML += `<polyline points="${pointsAttr}" fill="none" stroke="#C87A51" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

    FREQS.forEach((f, idx) => {
      const cx = freqToX(f);
      const cy = dbToY(state.thresholds[idx]);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", 8);
      circle.setAttribute("fill", "#FAFBF8");
      circle.setAttribute("stroke", "#C87A51");
      circle.setAttribute("stroke-width", "3");
      circle.style.cursor = "ns-resize";

      const startDrag = (e) => {
        e.preventDefault();
        const moveHandler = (ev) => {
          const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
          const rect = svg.getBoundingClientRect();
          const relY = ((clientY - rect.top) / rect.height) * 330;
          state.thresholds[idx] = yToDb(relY);
          const avgHigh = (state.thresholds[3]+state.thresholds[4]+state.thresholds[5])/3;
          const levelIndex = avgHigh < 25 ? 0 : avgHigh < 50 ? 1 : avgHigh < 75 ? 2 : 3;
          state.level = ["Normal","Mild","Moderate","Severe"][levelIndex];
          document.querySelectorAll(".level-node").forEach((el,i)=>el.classList.toggle("active",i===levelIndex));
          renderDegradedText(); updateAudioFilterLive();
          renderAudiogram();
        };
        const upHandler = () => {
          window.removeEventListener("mousemove", moveHandler);
          window.removeEventListener("mouseup", upHandler);
          window.removeEventListener("touchmove", moveHandler);
          window.removeEventListener("touchend", upHandler);
        };
        window.addEventListener("mousemove", moveHandler);
        window.addEventListener("mouseup", upHandler);
        window.addEventListener("touchmove", moveHandler, { passive: false });
        window.addEventListener("touchend", upHandler);
      };

      circle.addEventListener("mousedown", startDrag);
      circle.addEventListener("touchstart", startDrag, { passive: false });
      svg.appendChild(circle);
    });

    let audibleCount = 0;
    if (state.audiogramMode === "SOUNDS") {
      SOUND_ITEMS.forEach(item => {
        const userThresh = getUserThresholdAt(item.freq);
        const isAudible = item.db >= userThresh;
        if (isAudible) audibleCount++;

        const div = document.createElement("div");
        div.className = `sound-item ${isAudible ? "" : "inaudible"}`;
        div.style.left = `${(freqToX(item.freq) / 460) * 100}%`;
        div.style.top = `${(dbToY(item.db) / 330) * 100}%`;
        div.title = `${item.label} | Ngưỡng của bạn: ${Math.round(userThresh)}dB -> ${isAudible ? "NGHE ĐƯỢC" : "KHÔNG NGHE ĐƯỢC (Đã bị xám hóa)"}`;
        div.onclick = () => playSampleTone(item.freq, item.db);

        if (item.emoji) {
          div.innerHTML = `<span class="emoji">${item.emoji}</span>`;
        } else {
          div.innerHTML = `<span class="phoneme-cluster">${item.text}</span>`;
        }
        overlay.appendChild(div);
      });
    } else {
      audibleCount = SOUND_ITEMS.filter(item => item.db >= getUserThresholdAt(item.freq)).length;
    }

    document.getElementById("audibleSummary").textContent = `Minh họa khả năng nghe: ${audibleCount}/${SOUND_ITEMS.length} nhóm âm thanh`;
  }

  // ============================================================================
  // 5. DR. BUNNY CHAT
  // ============================================================================
  function appendChat(role, htmlText) {
    const box = document.getElementById("chatBox");
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.innerHTML = htmlText;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function askPredefined(type) {
    const lowAvg = Math.round((state.thresholds[0] + state.thresholds[1] + state.thresholds[2]) / 3);
    const highAvg = Math.round((state.thresholds[3] + state.thresholds[4] + state.thresholds[5]) / 3);
    const inaudibleList = SOUND_ITEMS.filter(i => i.db < getUserThresholdAt(i.freq)).map(i => i.label);

    if (type === "analyze_chart") {
      appendChat("user", "📊 Phân tích biểu đồ thính lực hiện tại của tôi");
      let reply = `🐰 <b>Kết quả phân tích từ Đồ thị Thính lực của bạn:</b><br/>` +
        `• Ngưỡng nghe âm trầm-trung (250–1000Hz): <b>${lowAvg} dB giả lập</b><br/>` +
        `• Ngưỡng nghe âm cao (2000–8000Hz): <b>${highAvg} dB giả lập</b><br/>`;
      if (inaudibleList.length === 0) {
        reply += `👉 Tuyệt vời! Đường biểu diễn của bạn nằm phía trên toàn bộ các âm thanh đời thường. Bạn nghe rõ cả tiếng chim hót lẫn các phụ âm nhẹ.`;
      } else {
        reply += `👉 Do đường biểu diễn bị kéo xuống thấp, các âm thanh đã chuyển sang <b>màu xám (không nghe thấy)</b> gồm: <i>${inaudibleList.join(", ")}</i>.`;
      }
      appendChat("bot", reply);
    } else if (type === "why_missing_letters") {
      appendChat("user", "🔤 Tại sao chữ cái lại biến mất ở mức Mild & Moderate?");
      appendChat("bot",
        `🐰 Theo lý thuyết <b>Quả chuối Ngôn ngữ (Speech Banana - ANSI S3.5)</b>:<br/>` +
        `• Các phụ âm như <b>s, f, th, x, t, k, ch</b> nằm ở tần số rất cao (2000–8000Hz) và phát ra năng lượng rất nhỏ (chỉ 15–30dB).<br/>` +
        `• Khi bị suy giảm thính lực mức Nhẹ (Mild) và Trung bình (Moderate), ốc tai mất khả năng bắt các tần số cao này trước tiên, làm câu nói bị "rụng" mất phụ âm như bạn thấy ở Tab Simulator!`
      );
    } else if (type === "noisy_places") {
      appendChat("user", "🛒 Tại sao ở siêu thị/nhà hàng tôi nghe tiếng nhưng không rõ chữ?");
      appendChat("bot",
        `🐰 Ở nơi đông người (Shopping, Restaurant), tiếng ồn nền lấn át hoàn toàn các phụ âm tần số cao. Bạn vẫn nghe thấy nguyên âm (<i>a, o, e, u</i>) nên biết người đối diện đang nói, nhưng não bộ phải tự "điền vào chỗ trống" các phụ âm bị mất, gây ra hiện tượng <b>nghe nhầm từ</b> và <b>mệt mỏi thính giác</b>.`
      );
    } else if (type === "family_tips") {
      appendChat("user", "👨‍👩‍👧 Người nhà nên giao tiếp thế nào cho dễ nghe?");
      appendChat("bot",
        `🐰 <b>3 nguyên tắc vàng dành cho gia đình:</b><br/>` +
        `1. <b>Không hét lớn:</b> Hét to chỉ làm tăng âm trầm gây chói tai (Loudness Recruitment). Hãy nói <b>chậm rãi, tách rõ từng chữ</b>.<br/>` +
        `2. <b>Nhìn thẳng mặt khi nói:</b> Để người nghe kết hợp nhìn khẩu hình môi bù cho các chữ <i>s, t, p, ch</i> bị khuyết.<br/>` +
        `3. <b>Giảm nhiễu nền:</b> Tắt bớt TV hoặc chọn góc ngồi yên tĩnh trước khi trò chuyện.`
      );
    }
  }

  function sendCustomChat() {
    const inp = document.getElementById("chatInput");
    const q = inp.value.trim().replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    if (!q) return;
    inp.value = "";
    appendChat("user", q);

    const highAvg = Math.round((state.thresholds[3] + state.thresholds[4] + state.thresholds[5]) / 3);
    appendChat("bot",
      `🐰 <b>[Mẫu giải thích — Tần số cao: ${highAvg} dB giả lập]:</b><br/>` +
      `Dựa trên câu hỏi <i>"${q}"</i> và biểu đồ hiện tại của bạn, hệ thống nhận thấy ngưỡng nghe tần số cao đang ở mức <b>${highAvg} dB</b> (Cấp độ mô phỏng: <b>${state.level}</b>). ` +
      `Bạn có thể chuyển sang tab <b>Audiogram (SOUNDS)</b> để kéo thử đường màu cam và quan sát trực tiếp những âm thanh nào chuyển sang màu xám nhé!`
    );
  }

  // ============================================================================
  // 6. NAVIGATION & INITIALIZATION
  // ============================================================================
  function switchTab(tabId) {
    ["simulator", "chat", "audiogram"].forEach(id => {
      document.getElementById(`tab-${id}`).classList.toggle("active", id === tabId);
      document.getElementById(`nav-${id}`).classList.toggle("active", id === tabId);
    });
    if (tabId === "audiogram") renderAudiogram();
  }

  function initialize() {
    document.getElementById('scenarioSelect').addEventListener('change', updateScenario);
    document.getElementById('langBtn').addEventListener('click', toggleLanguage);
    document.querySelectorAll('[data-loss-level]').forEach(node => node.addEventListener('click', () => {
      setLossLevel(node.dataset.lossLevel, Number(node.dataset.lossIndex));
    }));
    document.getElementById('demoAudioFile').addEventListener('change', loadDemoAudio);
    document.getElementById('playBtn').addEventListener('click', toggleAudioSimulation);
    document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => askPredefined(button.dataset.question)));
    document.getElementById('sendChat').addEventListener('click', sendCustomChat);
    document.getElementById('chatInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') sendCustomChat();
    });
    document.querySelectorAll('[data-audiogram-mode]').forEach(button => button.addEventListener('click', () => setAudiogramMode(button.dataset.audiogramMode)));
    document.getElementById('mascotChat').addEventListener('click', () => switchTab('chat'));
    document.querySelectorAll('[data-target-tab]').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.targetTab)));
    renderDegradedText();
    renderAudiogram();
  }

  initialize();
})();
