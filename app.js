const $ = id => document.getElementById(id);
let devices = [], stream = null, audioCtx = null, source = null, analyser = null;
let voiceGain = null, panner = null, meterFrame = null, activeMode = null, activeTrack = null;
let testOsc = null, testGain = null;

function setStatus(s) { $('status').textContent = s; }
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx.resume();
}
function stopCurrentStream() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  if (source) { try { source.disconnect(); } catch (_) {} source = null; }
  if (analyser) { try { analyser.disconnect(); } catch (_) {} analyser = null; }
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; activeTrack = null;
  $('meterFill').style.width = '0%'; $('level').textContent = '--';
}
function getInputs() {
  return navigator.mediaDevices.enumerateDevices().then(all => {
    devices = all.filter(d => d.kind === 'audioinput');
    fillSelect('phoneInput', devices, 'iPhoneマイクを選択');
    fillSelect('airpodsInput', devices, 'AirPodsマイクを選択');
    const phone = devices.find(d => /iphone|built.?in|内蔵|マイク/i.test(d.label) && !/airpods|bluetooth/i.test(d.label));
    const air = devices.find(d => /airpods|bluetooth/i.test(d.label));
    if (phone) $('phoneInput').value = phone.deviceId;
    if (air) $('airpodsInput').value = air.deviceId;
    $('inputCount').textContent = `${devices.length} 個`;
    $('deviceInfo').textContent = devices.map(d => d.label || '名称非公開の入力').join(' / ') || '入力デバイスがありません';
    $('routeInfo').textContent = '入力候補：' + devices.map(d => d.label || '名称非公開').join('、');
    const ready = devices.length > 0;
    $('selfButton').disabled = !ready; $('otherButton').disabled = !ready;
    return devices;
  });
}
function fillSelect(id, list, placeholder) {
  const el = $(id), old = el.value;
  el.innerHTML = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = placeholder; el.appendChild(first);
  list.forEach((d, i) => {
    const o = document.createElement('option'); o.value = d.deviceId;
    o.textContent = d.label || `入力デバイス ${i + 1}`; el.appendChild(o);
  });
  if (list.some(d => d.deviceId === old)) el.value = old;
}
async function initialize() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPSのSafariで開いてください');
    setStatus('許可待ち');
    const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    temp.getTracks().forEach(t => t.stop());
    await getInputs();
    await ensureAudio();
    $('channelInfo').textContent = `AudioContext: ${audioCtx.state}`;
    $('micState').textContent = '準備完了。自分／相手のボタンでマイクを切り替えられます。';
    $('initButton').textContent = 'デバイス情報を再取得';
    setStatus('準備完了');
  } catch (e) {
    $('micState').textContent = `初期化できません：${e.name || e.message}`;
    setStatus('許可エラー');
  }
}
function buildOutputGraph() {
  if (!voiceGain) {
    voiceGain = audioCtx.createGain();
    voiceGain.gain.value = Number($('voiceVolume').value);
    panner = audioCtx.createStereoPanner();
    voiceGain.connect(panner); panner.connect(audioCtx.destination);
  }
}
function startMeter() {
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const draw = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(data); let sum = 0;
    for (const v of data) { const n = (v - 128) / 128; sum += n * n; }
    const pct = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 300));
    $('meterFill').style.width = pct + '%'; $('level').textContent = pct + '%';
    meterFrame = requestAnimationFrame(draw);
  };
  draw();
}
async function activate(mode) {
  const id = mode === 'self' ? $('phoneInput').value : $('airpodsInput').value;
  const label = mode === 'self' ? 'iPhoneマイク' : 'AirPodsマイク';
  if (!id) { $('micState').textContent = `${label}が選択されていません。デバイス一覧を確認してください。`; return; }

  let nextStream = null;
  let nextSource = null;
  try {
    setStatus('入力切替中');
    await ensureAudio();

    // 先に新しい入力を取得する。取得に失敗しても現在の入力と出力グラフを壊さない。
    nextStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: id },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    });

    nextSource = audioCtx.createMediaStreamSource(nextStream);
    buildOutputGraph();
    panner.pan.setValueAtTime(mode === 'self' ? -1 : 1, audioCtx.currentTime);
    nextSource.connect(voiceGain);

    // 新入力が接続できてから旧入力を解放する。AudioContext / 出力グラフは維持。
    const oldStream = stream;
    const oldSource = source;
    const oldAnalyser = analyser;
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = null;
    if (oldSource) { try { oldSource.disconnect(); } catch (_) {} }
    if (oldAnalyser) { try { oldAnalyser.disconnect(); } catch (_) {} }
    if (oldStream) oldStream.getTracks().forEach(t => t.stop());

    stream = nextStream;
    source = nextSource;
    analyser = null;
    activeTrack = stream.getAudioTracks()[0];
    activeMode = mode;

    startMeter();
    $('selfButton').classList.toggle('selected', mode === 'self');
    $('otherButton').classList.toggle('selected', mode === 'other');
    $('activeMode').textContent = mode === 'self'
      ? '自分モード：iPhoneマイク → 左チャンネル'
      : '相手モード：AirPodsマイク → 右チャンネル';
    $('micState').textContent = `${label}で入力中。入力レベルが動き、AirPodsから音声が聞こえるか確認してください。`;
    const settings = activeTrack.getSettings ? activeTrack.getSettings() : {};
    $('trackInfo').textContent = `取得中：${activeTrack.label || label} / channelCount: ${settings.channelCount ?? '不明'} / sampleRate: ${settings.sampleRate ?? '不明'} / echoCancellation: ${settings.echoCancellation ?? '不明'}`;
    $('channelInfo').textContent = `Web Audio pan：${mode === 'self' ? '左 (-1)' : '右 (+1)'} / AudioContext: ${audioCtx.state}`;
    $('stopButton').disabled = false;
    setStatus(mode === 'self' ? '自分モード' : '相手モード');
  } catch (e) {
    // 新入力の取得失敗時は既存入力を維持する。
    if (nextSource) { try { nextSource.disconnect(); } catch (_) {} }
    if (nextStream) nextStream.getTracks().forEach(t => t.stop());
    $('micState').textContent = `切替失敗：${e.name || e.message}。現在の入力は可能な限り維持しています。`;
    setStatus('切替エラー');
  }
}
function stopAll() {
  stopCurrentStream(); activeMode = null;
  $('selfButton').classList.remove('selected'); $('otherButton').classList.remove('selected');
  $('activeMode').textContent = '通話モード：停止中';
  $('micState').textContent = 'マイク停止中'; $('trackInfo').textContent = '取得トラック：停止';
  $('channelInfo').textContent = '出力チャンネル：未選択'; $('stopButton').disabled = true;
  setStatus('停止中');
}
async function playChannelTest(side) {
  try {
    await ensureAudio();
    stopTest(); buildOutputGraph();
    testOsc = audioCtx.createOscillator(); testGain = audioCtx.createGain();
    testOsc.frequency.value = 440; testGain.gain.value = 0.035;
    const testPan = audioCtx.createStereoPanner(); testPan.pan.value = side === 'left' ? -1 : 1;
    testOsc.connect(testGain); testGain.connect(testPan); testPan.connect(audioCtx.destination); testOsc.start();
    $('outputState').textContent = `${side === 'left' ? '左' : '右'}チャンネルから440Hzを再生中 / AudioContext: ${audioCtx.state}（もう一度同じボタンで停止）`;
    $('leftTest').disabled = side === 'left'; $('rightTest').disabled = side === 'right';
  } catch (e) { $('outputState').textContent = `再生エラー：${e.message}`; }
}
function stopTest() {
  if (testOsc) { try { testOsc.stop(); } catch (_) {} try { testOsc.disconnect(); } catch (_) {} testOsc = null; }
  if (testGain) { try { testGain.disconnect(); } catch (_) {} testGain = null; }
  $('leftTest').disabled = false; $('rightTest').disabled = false;
}
$('initButton').addEventListener('click', initialize);
$('selfButton').addEventListener('click', () => activeMode === 'self' ? stopAll() : activate('self'));
$('otherButton').addEventListener('click', () => activeMode === 'other' ? stopAll() : activate('other'));
$('stopButton').addEventListener('click', stopAll);
$('leftTest').addEventListener('click', () => testOsc ? stopTest() : playChannelTest('left'));
$('rightTest').addEventListener('click', () => testOsc ? stopTest() : playChannelTest('right'));
$('voiceVolume').addEventListener('input', () => {
  const v = Number($('voiceVolume').value); $('voiceVolumeValue').textContent = Math.round(v * 100) + '%';
  if (voiceGain && audioCtx) voiceGain.gain.setTargetAtTime(v, audioCtx.currentTime, .025);
});
$('refreshButton').addEventListener('click', () => getInputs().catch(e => $('deviceInfo').textContent = e.message));
$('phoneInput').addEventListener('change', () => { if (activeMode === 'self') activate('self'); });
$('airpodsInput').addEventListener('change', () => { if (activeMode === 'other') activate('other'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopTest(); });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
