# AirTalk Web v0.1
GitHub Pages向けの音声入出力テスト用PWAです。

## GitHubにアップロード
1. 新しいリポジトリ `AirTalk-Web` を作成（README追加は任意）。
2. ZIPを解凍し、中身をリポジトリのルートにアップロード。フォルダ構成を維持してください。
3. Settings → Pages → Build and deployment → Deploy from a branch。
4. Branch=`main`、folder=`/(root)` を選んでSave。
5. 公開されたPages URLをiPhoneのSafariで開く。

## ホーム画面に追加
Safariの共有ボタン →「ホーム画面に追加」。表示される場合は「Webアプリとして開く」を有効にします。

## テスト
AirPodsを接続し、HTTPSのPages URLでマイク開始・440Hzテスト音・デバイス情報を確認します。マイク許可にはHTTPSが必要です。

## 制約
この版は基本的な入出力のテスト用で、左右AirPodsの独立マイク／スピーカー制御や二人用の双方向インターコム機能は未実装です。iOS SafariのWeb APIとBluetoothルーティングの制約により左右独立制御は保証されません。