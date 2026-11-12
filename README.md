# AirTalk Web v0.4

## v0.4の変更
- Safariが公開する `audioinput` を一覧表示
- 入力デバイスを選択して `deviceId` 指定で再取得する切替機能
- 入力トラックのチャンネル数・取得可能な設定情報を表示
- v0.3のマイクモニタリングと独立音量、440Hzテスト音を維持

## 重要な制約
この版は「Safariが公開する入力デバイスの切替」を試す実験版です。
iOSのBluetooth設定にあるAirPodsの「マイク：左/右」をWebアプリから直接変更するAPIはありません。
AirPodsがSafariに1つのaudioinputとしてしか公開されない場合、Webアプリから左右のマイクを個別選択することはできません。
`channelCount` が2と表示されても、それだけで左右のAirPodsマイクが別々の信号として取得できているとは限りません。

## GitHub Pagesへの反映
ZIPを展開し、既存リポジトリのファイルを上書きしてください。`icons/`、`manifest.webmanifest`、`sw.js`も含めて配置します。
