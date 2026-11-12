const $ = id => document.getElementById(id);

let stream = null, ctx = null, analyser = null, frame = null;
let osc = null, toneGain = null, micSource = null, monitorGain = null;
let monitorCompressor = null, monitoring = false, selectedInputId = "";

function status(s) { $("status").textContent = s; }

function stopTracks() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (micSource) { try { micSource.disconnect(); } catch(e) {} micSource = null; }
}

async function listInputs() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === "audioinput");
  const select = $("inputSelect");
  const previous = selectedInputId || select.value;
  select.innerHTML = "";

  if (!inputs.length) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "入力デバイスが見つかりません";
    select.appendChild(opt);
    selectedInputId = "";
    $("inputInfo").textContent = "マイク入力が公開されていません。先にマイクを開始してください。";
    return inputs;
  }

  inputs.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `入力デバイス ${i + 1}`;
    select.appendChild(opt);
  });

  const stillExists = inputs.some(d => d.deviceId === previous);
  selectedInputId = stillExists ? previous : inputs[0].deviceId;
  select.value = selectedInputId;

  $("inputInfo").textContent = inputs.length === 1
    ? "iOS/Safariから公開されている入力は1つです。左右マイクが別デバイスとして公開されていない場合、アプリから左右を切り替えることはできません。"
    : `${inputs.length}個の入力デバイスを検出。選択して切り替えを試せます。`;
  $("inputRoute").textContent = inputs.map(d => d.label || "名称非公開").join(" / ");
  return inputs;
}

async function refreshRoutes() {
  try {
    const inputs = await listInputs();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === "audiooutput");
    $("outputRoute").textContent = outputs.length
      ? outputs.map(d => d.label || "出力先（名称非公開）").join(" / ")
      : "iOSが選択";
    $("inputCount").textContent = `${inputs.length} 個`;
  } catch (e) {
    $("inputInfo").textContent = `デバイス情報を取得できません: ${e.message}`;
  }
}

function ensureAudioContext() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  return ctx.resume();
}

function startMeter() {
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  micSource.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const draw = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) { const n = (v - 128) / 128; sum += n * n; }
    const pct = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 260));
    $("meterFill").style.width = pct + "%";
    $("level").textContent = pct + "%";
    frame = requestAnimationFrame(draw);
  };
  draw();
}

function setupMonitorGraph() {
  monitorGain = ctx.createGain();
  monitorGain.gain.value = Number($("monitorVolume").value);
  monitorCompressor = ctx.createDynamicsCompressor();
  monitorCompressor.threshold.value = -18;
  monitorCompressor.knee.value = 18;
  monitorCompressor.ratio.value = 8;
  monitorCompressor.attack.value = .003;
  monitorCompressor.release.value = .18;
}

async function openSelectedInput() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("SafariでHTTPSのURLを開いてください");
  const constraints = selectedInputId
    ? { audio: { deviceId: { exact: selectedInputId } } }
    : { audio: true };

  const wasMonitoring = monitoring;
  if (wasMonitoring) stopMonitor();
  stopTracks();

  stream = await navigator.mediaDevices.getUserMedia(constraints);
  await ensureAudioContext();
  micSource = ctx.createMediaStreamSource(stream);
  if (!monitorGain) setupMonitorGraph();
  startMeter();

  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() || {};
  const caps = track?.getCapabilities?.() || {};
  const channelCount = settings.channelCount ?? "取得不可";
  $("trackInfo").textContent =
    `取得中: ${track?.label || "マイク"} / チャンネル数: ${channelCount}` +
    (settings.sampleRate ? ` / ${settings.sampleRate}Hz` : "");
  $("capabilityInfo").textContent =
    `deviceId指定: ${selectedInputId ? "あり" : "なし"} / channelCount対応: ${"channelCount" in caps ? "あり" : "不明"}`;

  if (wasMonitoring) startMonitor();
  await refreshRoutes();
}

async function startMic() {
  try {
    // 権限を得てからラベル付きの入力一覧を取得
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("SafariでHTTPSのURLを開いてください");
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach(t => t.stop());
    await refreshRoutes();
    selectedInputId = $("inputSelect").value || "";
    await openSelectedInput();

    $("micButton").textContent = "マイクを停止";
    $("micButton").dataset.on = "1";
    $("switchButton").disabled = false;
    $("monitorButton").disabled = false;
    $("micState").textContent = "マイク使用中。入力デバイスの切替を試せます。";
    status("マイク使用中");
  } catch (e) {
    $("micState").textContent = `開始できません: ${e.name || e.message}`;
    status("マイクエラー");
  }
}

function stopMic() {
  stopMonitor();
  if (frame) cancelAnimationFrame(frame);
  frame = null; analyser = null;
  stopTracks();
  if (monitorGain) { monitorGain.disconnect(); monitorGain = null; }
  if (monitorCompressor) { monitorCompressor.disconnect(); monitorCompressor = null; }
  $("meterFill").style.width = "0";
  $("level").textContent = "--";
  $("micButton").textContent = "マイクを開始";
  delete $("micButton").dataset.on;
  $("switchButton").disabled = true;
  $("monitorButton").disabled = true;
  $("micState").textContent = "マイク停止中";
  $("trackInfo").textContent = "未取得";
  status("待機中");
}

async function switchInput() {
  try {
    selectedInputId = $("inputSelect").value;
    await openSelectedInput();
    $("micState").textContent = "入力デバイスを切り替えました。";
    status("入力切替済み");
  } catch (e) {
    $("micState").textContent = `切替失敗: ${e.name || e.message}`;
    status("切替エラー");
  }
}

function startMonitor() {
  if (!micSource || !monitorGain || !ctx) return;
  ctx.resume();
  micSource.connect(monitorGain);
  monitorGain.connect(monitorCompressor);
  monitorCompressor.connect(ctx.destination);
  monitoring = true;
  $("monitorButton").textContent = "モニタリング停止";
  $("monitorState").textContent = "マイク音声を出力先へ流しています";
  status("モニタリング中");
}

function stopMonitor() {
  if (micSource && monitorGain) {
    try { micSource.disconnect(monitorGain); } catch(e) {}
  }
  if (monitorGain) { try { monitorGain.disconnect(); } catch(e) {} }
  if (monitorCompressor) { try { monitorCompressor.disconnect(); } catch(e) {} }
  monitoring = false;
  if ($("monitorButton")) $("monitorButton").textContent = "モニタリング開始";
  if ($("monitorState")) $("monitorState").textContent = "停止中";
}

function playTone() {
  try {
    ensureAudioContext();
    osc = ctx.createOscillator();
    toneGain = ctx.createGain();
    osc.frequency.value = 440;
    toneGain.gain.value = Number($("toneVolume").value);
    osc.connect(toneGain); toneGain.connect(ctx.destination); osc.start();
    $("toneButton").disabled = true;
    $("stopButton").disabled = false;
    $("outputState").textContent = "440Hzを再生中";
  } catch(e) { $("outputState").textContent = `再生できません: ${e.message}`; }
}

function stopTone() {
  if (osc) { try { osc.stop(); } catch(e) {} osc.disconnect(); osc = null; }
  if (toneGain) { toneGain.disconnect(); toneGain = null; }
  $("toneButton").disabled = false;
  $("stopButton").disabled = true;
  $("outputState").textContent = "停止しました";
}

$("micButton").onclick = () => $("micButton").dataset.on ? stopMic() : startMic();
$("switchButton").onclick = switchInput;
$("monitorButton").onclick = () => monitoring ? stopMonitor() : startMonitor();
$("toneButton").onclick = playTone;
$("stopButton").onclick = stopTone;
$("refreshButton").onclick = refreshRoutes;
$("monitorVolume").oninput = () => {
  const v = Number($("monitorVolume").value);
  $("monitorVolumeValue").textContent = Math.round(v * 100) + "%";
  if (monitorGain && ctx) monitorGain.gain.setTargetAtTime(v, ctx.currentTime, .02);
};
$("toneVolume").oninput = () => {
  const v = Number($("toneVolume").value);
  $("toneVolumeValue").textContent = Math.round(v * 100) + "%";
  if (toneGain && ctx) toneGain.gain.setTargetAtTime(v, ctx.currentTime, .02);
};
document.addEventListener("visibilitychange", () => { if (document.hidden) stopTone(); });
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
refreshRoutes();
