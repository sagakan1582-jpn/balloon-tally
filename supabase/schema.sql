-- バルーン集計アプリのテーブル定義。
-- Supabase ダッシュボードの SQL Editor に全文を貼り付けて Run する（何度実行しても安全）。
-- 種類・色を変えるときは js/config.js とこのファイルの check 制約を両方直すこと。

create table if not exists public.records (
  id          uuid primary key,                    -- スマホ側で発行（再送しても二重登録にならない）
  item        text not null,
  color1      text not null,
  color2      text,                                -- 2色の種類で 2色えらんだときだけ入る
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
  constraint records_device_check check (device is null or char_length(device) <= 40)
);

-- 2色の種類（はな・ハート・アンパンマン）は 1色でも 2色でも登録できる。1色の種類は 2色目を持てない。
-- 以前の「2色の種類は必ず 2色」という決まりを置き換えるため、作り直す形にしている。
alter table public.records drop constraint if exists records_two_color_check;
alter table public.records add constraint records_two_color_check check (
  color2 is null or item in ('flower', 'heart', 'anpanman')
);

create index if not exists records_recorded_at_idx on public.records (recorded_at);

-- アクセス制限なしの方針でも記録の中身は守る。公開キー（anon）でできるのは次の 3 つだけ:
--   読む / 新しい記録を追加する / 取り消し印（deleted_at）を付け外しする（取り消し・復元）
-- 種類・色・時刻などの書き換え、行の削除、全件消去はできない。
alter table public.records enable row level security;

-- プロジェクト作成時に「Automatically expose new tables」を切っていても動くよう、必要な権限を明示する。
-- 一度すべて外してから付け直す（以前の版で付けていた「全項目の書き換え」を確実に外すため）。
grant usage on schema public to anon, authenticated;
revoke all on public.records from anon, authenticated;
grant select, insert on public.records to anon, authenticated;
grant update (deleted_at) on public.records to anon, authenticated;

drop policy if exists "records_select" on public.records;
drop policy if exists "records_insert" on public.records;
drop policy if exists "records_update" on public.records;

create policy "records_select" on public.records
  for select to anon, authenticated using (true);
create policy "records_insert" on public.records
  for insert to anon, authenticated with check (true);
create policy "records_update" on public.records
  for update to anon, authenticated using (true) with check (true);

-- 変更履歴。records への追加・変更・削除を自動で 1 件ずつ残す（公開キーからは読めない・書けない）。
-- SQL Editor での操作ミスで消したり書き換えたりしても、ここから元に戻せる（README 参照）。
create table if not exists public.records_log (
  log_id    bigint generated always as identity primary key,
  logged_at timestamptz not null default now(),
  operation text not null,   -- INSERT / UPDATE / DELETE
  record_id uuid,
  old_row   jsonb,           -- 変更・削除の前の内容
  new_row   jsonb            -- 追加・変更の後の内容
);
alter table public.records_log enable row level security;
revoke all on public.records_log from anon, authenticated;

create or replace function public.log_records_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.records_log (operation, record_id, old_row, new_row)
  values (
    tg_op,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;
revoke all on function public.log_records_change() from public, anon, authenticated;

drop trigger if exists records_log_trigger on public.records;
create trigger records_log_trigger
  after insert or update or delete on public.records
  for each row execute function public.log_records_change();

-- 全件消去（truncate）は履歴に残らず元に戻せないので禁止する。消すときは delete を使う（README 参照）。
create or replace function public.forbid_records_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'records の truncate は禁止しています。delete from public.records where ... を使ってください（履歴に残り、元に戻せます）。';
end;
$$;
revoke all on function public.forbid_records_truncate() from public, anon, authenticated;

drop trigger if exists records_no_truncate on public.records;
create trigger records_no_truncate
  before truncate on public.records
  for each statement execute function public.forbid_records_truncate();

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
