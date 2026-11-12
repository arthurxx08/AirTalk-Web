# AirTalk Web v0.7

- v0.5の音声出力グラフをベースに修正
- マイク切替時、新しい入力を取得・接続してから古い入力を停止
- AudioContext / voiceGain / panner の出力グラフを維持
- 440HzテストはAudioContextのresume完了後に開始
- iPhoneマイクの音響回り込みを抑えるため echoCancellation / noiseSuppression を有効化
- AirPodsはiPhone設定で「マイク：常に右」に固定

注意：iOS Safariが入力選択時にBluetooth出力ルートを変更する場合、Webアプリだけでは出力先を強制できません。実機での動作確認が必要です。
