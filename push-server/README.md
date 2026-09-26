# EmiruTo Push Server

EmiruTo の完全バックグラウンド通知用の標準 Web Push サーバーです。

## 必要な環境変数

- `DATABASE_URL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` 例: `mailto:you@example.com`
- `ALLOWED_ORIGIN=https://akito0802.github.io`

VAPID キーは `npm run generate-vapid` で生成できます。秘密鍵はリポジトリにコミットしないでください。

## API

- `GET /api/health`
- `GET /api/vapid-public-key`
- `POST /api/subscribe`
- `POST /api/schedule`
- `POST /api/unsubscribe`

`send-due.js` を1分おきに実行すると、EmiruTo を閉じていても Push API 経由で通知できます。
