# バルーン集計

学祭当日、受付で聞いた「種類」と「色」をスマホで記録し、PC で時間帯別・種類別・色別に見るためのアプリです。

- **入力画面**（`index.html`）… スマホ用。種類 → 色 → 「登録する」。
- **集計画面**（`admin.html`）… PC 用。合計、時間帯別、色別、2色の組み合わせ、記録一覧、CSV ダウンロード。

記録は Supabase（クラウドのデータベース）に集まります。電波が切れているあいだの登録はスマホの中に溜まり、つながったときに自動で送られます。

## 準備（最初に1回）

### 1. Supabase

1. [Supabase](https://supabase.com/dashboard) で新しいプロジェクトを作る（リージョンは Tokyo）。
2. 左メニューの **SQL Editor** を開き、[supabase/schema.sql](supabase/schema.sql) の中身を全部貼り付けて **Run**。
3. **Project Settings → API**（または Data API / API Keys）で次の2つを控える。
   - Project URL（`https://xxxx.supabase.co`）
   - 公開用のキー（`anon` または `publishable` と書かれているもの）
4. [js/config.js](js/config.js) の先頭2行に貼る。

   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_KEY = '公開用のキー';
   ```

   `service_role` / `secret` と書かれたキーは**絶対に入れない**でください（何でもできる管理用のキーです）。

2行が空のあいだは「デモモード」になり、そのブラウザの中だけに保存されます（画面上部に表示が出ます）。操作の練習に使えます。

### 2. 公開（GitHub Pages）

1. GitHub で空のリポジトリを作る（無料プランでは Public にする必要があります）。
2. このフォルダを push する。

   ```
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

3. リポジトリの **Settings → Pages** で、Source を「Deploy from a branch」、Branch を `main` / `(root)` にして保存。
4. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` が入力画面、末尾に `admin.html` を付けると集計画面になります。

スマホではこの URL を開き、ブラウザのメニューから「ホーム画面に追加」しておくとアプリのように使えます。

## 当日の使い方

### スマホ（受付）

1. 種類のアイコンをタップ。
2. 色をタップ。「2色」と付いている種類（はな・ハート・アンパンマン）は2つまで選べる（1色だけでも登録できる）。同じ色を2回タップすると同色2回（×2）になる。
3. 「登録する」をタップ。1回の登録が1個です。

- 間違えたら、直後に出る「取り消す」か、下の「この端末の直近の登録」から取り消せます（元に戻すこともできます）。
- 右上が「未送信 n 件」のときは、まだサーバーに届いていない記録があります。電波が戻れば自動で送られるので、そのまま続けて大丈夫です。**未送信が残っているあいだは、ブラウザのデータ（履歴・サイトデータ）を消さないでください。**
- 画面下の「端末名を設定」で「受付1」などの名前を付けておくと、どのスマホの入力か集計画面で分かります。

### PC（集計）

- 開いておけば自動で更新されます（念のため30秒ごとにも取り直します）。
- 日付を切り替えるか、「全期間」にチェックで全日程の合計を見られます。
- 時間帯は日本時間で、10時台〜17時台に分けます。10時より前・18時以降の登録は「時間外」に入ります。
- 「色別の使用数」は、2色の種類なら使った色それぞれを1と数えます。
- 記録一覧の「取り消す」で集計から外せます。データ自体は消えないので「元に戻す」で復活できます。
- 「CSV ダウンロード」は Excel でそのまま開けます（取り消し済みの記録も「状態」列つきで入ります）。

## 本番前に

- 練習で入れたデータを消すには、Supabase の SQL Editor で次を実行します。

  ```sql
  truncate table public.records;
  ```

- Supabase の無料プランは、しばらくアクセスがないとプロジェクトが一時停止されます。**前日にダッシュボードを開いて、動いていることを確認**してください。
- このアプリには合言葉などの制限がありません。URL を知っている人は入力も閲覧もできるので、URL は受付メンバーだけで共有してください。行の削除はできない設定なので、いたずらで入力されても「取り消す」で対処でき、元の記録は残ります。

## 種類・色・営業時間を変える

[js/config.js](js/config.js) の `ITEMS` / `COLORS` / `OPEN_HOUR` / `CLOSE_HOUR` を直します。
種類や色を増減したときは、[supabase/schema.sql](supabase/schema.sql) の `check` の一覧も同じように直して、SQL Editor で次のように制約を入れ替えてください（例：色を追加した場合）。

```sql
alter table public.records drop constraint records_color1_check;
alter table public.records drop constraint records_color2_check;
-- その後、schema.sql の該当する check を alter table ... add constraint で追加
```

種類を増やす場合は [js/icons.js](js/icons.js) にアイコンも追加します。

## 手元で動かす

```
npm start        # http://localhost:8080/ で開く（Python の簡易サーバー）
npm test         # 集計ロジックと未送信キューのテスト
```

ファイルを直接ダブルクリックして開いても動きません（サーバー経由で開く必要があります）。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `js/input.js` | スマホ入力画面 |
| `admin.html` / `js/admin.js` | PC 集計・管理画面 |
| `js/config.js` | 接続先、種類・色・営業時間の定義 |
| `js/core.js` | 時間帯の判定、集計、CSV 生成 |
| `js/queue.js` | 未送信キュー（電波が悪いときの再送） |
| `js/store.js` | Supabase とのやり取り、デモモード |
| `sw.js` | 画面のファイルを端末に控え、圏外でも開けるようにする |
| `supabase/schema.sql` | データベースの定義 |
| `vendor/supabase.js` | Supabase 公式ライブラリ（同梱） |
