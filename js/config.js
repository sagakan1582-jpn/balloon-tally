// Supabase の接続先。空のあいだは「デモモード」（このブラウザの中だけに保存）で動く。
// SUPABASE_KEY には公開用のキー（anon / publishable）だけを入れる。service_role キーは入れないこと。
export const SUPABASE_URL = 'https://zodhnyriycmkzgfsozat.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_MtcJJeT1YYITsYJTNFoR8A_nqFCM0vY';

// 種類。colors は選べる色の最大数（2 の種類は 1色でも 2色でも登録できる）。
// supabase/schema.sql の check 制約と揃えること。
export const ITEMS = [
  { id: 'dog', label: '犬', colors: 1 },
  { id: 'bear', label: 'くま', colors: 1 },
  { id: 'sword', label: '剣', colors: 1 },
  { id: 'flower', label: 'はな', colors: 2 },
  { id: 'heart', label: 'ハート', colors: 2 },
  { id: 'anpanman', label: 'アンパンマン', colors: 2 },
];

// 色。並び順が 2色の組み合わせを保存するときの順番になる。
export const COLORS = [
  { id: 'pink', label: 'ピンク', hex: '#f58ab4' },
  { id: 'red', label: '赤', hex: '#e02a2f' },
  { id: 'yellow', label: 'イエロー', hex: '#ffd61f' },
  { id: 'orange', label: 'オレンジ', hex: '#ff8a1f' },
  { id: 'lilac', label: 'ライラック', hex: '#b596dc' },
  { id: 'blue', label: 'ブルー', hex: '#2f80dc' },
  { id: 'green', label: 'グリーン', hex: '#2ea44f' },
  { id: 'peach', label: 'ピーチブラッシュ', hex: '#f9c7a6' },
];

// 営業時間（日本時間）。OPEN_HOUR 時台から CLOSE_HOUR - 1 時台までを集計し、それ以外は「時間外」。
export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 18;
