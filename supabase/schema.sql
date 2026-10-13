-- バルーン集計アプリのテーブル定義。
-- Supabase ダッシュボードの SQL Editor に全文を貼り付けて Run する（何度実行しても安全）。
-- 種類・色を変えるときは js/config.js とこのファイルの check 制約を両方直すこと。

create table if not exists public.records (
  id          uuid primary key,                    -- スマホ側で発行（再送しても二重登録にならない）
  item        text not null,
  color1      text not null,
  color2      text,                                -- 2色の種類だけ入る
  recorded_at timestamptz not null,                -- スマホで登録ボタンを押した時刻（集計に使う）
  received_at timestamptz not null default now(),  -- サーバーに届いた時刻
  device      text,                                -- 端末の呼び名（任意）
  deleted_at  timestamptz,                         -- 取り消した時刻（行は消さない＝復元できる）

  constraint records_item_check check (
    item in ('dog', 'bear', 'sword', 'flower', 'heart', 'anpanman')
  ),
  constraint records_color1_check check (
    color1 in ('pink', 'red', 'yellow', 'orange', 'lilac', 'blue', 'green', 'peach')
  ),
  constraint records_color2_check check (
    color2 is null
    or color2 in ('pink', 'red', 'yellow', 'orange', 'lilac', 'blue', 'green', 'peach')
  ),
  constraint records_two_color_check check (
    (item in ('flower', 'heart', 'anpanman')) = (color2 is not null)
  ),
  constraint records_device_check check (device is null or char_length(device) <= 40)
);

create index if not exists records_recorded_at_idx on public.records (recorded_at);

-- アクセス制限なしの方針: 公開キー（anon）で 読む・追加する・更新する（取り消し／復元）ができる。
-- 行の削除は許可しないので、いたずらされても元のデータは残る。
alter table public.records enable row level security;

-- プロジェクト作成時に「Automatically expose new tables」を切っていても動くよう、必要な権限を明示する。
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.records to anon, authenticated;
revoke delete, truncate on public.records from anon, authenticated;

drop policy if exists "records_select" on public.records;
drop policy if exists "records_insert" on public.records;
drop policy if exists "records_update" on public.records;

create policy "records_select" on public.records
  for select to anon, authenticated using (true);
create policy "records_insert" on public.records
  for insert to anon, authenticated with check (true);
create policy "records_update" on public.records
  for update to anon, authenticated using (true) with check (true);

-- PC の集計画面へ即時反映するための Realtime 設定。
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
