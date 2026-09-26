# EmiruTo

自分専用のスマホ向け TODO / 予定管理 PWA。

## 現在の実装
- 4桁パスコード
- 今日のTODO / 予定
- TODO追加・完了・進捗・優先度・延期・最低限
- 月カレンダー
- 履歴 / 簡易分析
- 推しメッセージ・完了リアクション
- 長押しの「今日はしんどい」隠しモード
- ステルスモード
- 推し画像アップロード（端末内保存）
- JSON / CSVエクスポート
- PWA / オフラインキャッシュ
- ローカル保存
- 標準 Web Push によるバックグラウンド通知
- VAPID鍵のDB内自動生成・永続化
- GitHub Actionsによる5分間隔の無料Push送信トリガー

## GitHub Pages
Repository Settings → Pages → Build and deployment → Source を **Deploy from a branch** にして、
Branch を **main / root** に設定すると公開できます。

公開URLは通常:
https://akito0802.github.io/EmiruTo/

## Push API を Render にデプロイ
このリポジトリの `render.yaml` は、次をまとめて構成します。

- 無料Webサービス `emiruto-push-api`
- 無料Postgres `emiruto-push-db`
- DB接続の自動配線

VAPID鍵は初回起動時に自動生成され、Postgres内に保存されます。秘密鍵をGitHubへ置く必要はありません。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/akito0802/EmiruTo)

Render側のAPI URLが `https://emiruto-push-api.onrender.com` で公開されたら、`push-config.js` の
`window.EMIRUTO_PUSH_SERVER` にそのURLを設定します。

通知送信はRenderの有料cronを使わず、GitHub Actionsの `EmiruTo Push Tick` が5分おきに
`/api/send-due` を呼び出します。Free Web Serviceのスリープ解除を伴う場合があるため、
通知は数分遅れることがあります。

## 今後
Googleログイン、端末間同期、Google Calendar一方向同期、通知の精度向上、衣装・季節差分、レアメッセージ拡充など。
