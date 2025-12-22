"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx'; // 【追加】Excelライブラリのインポー
import { useRouter } from 'next/navigation';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resizeImage } from '@/lib/image-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function PurchaseForm() {
  // --- 1. 単位リストをStateで管理 ---
  const [units, setUnits] = useState(['BL', 'PK', 'C/S', 'KG']); 
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    itemName: '',
    price: 0,
    quantity: 0,
    unit: 'BL',
  });
  // 既存の formData とは別に、スキャン済みリストを用意
  const [scannedList, setScannedList] = useState<any[]>([]);
  const router = useRouter();

  const downloadExcel = () => {
    // 1. 保存されているデータ（items）をExcel用の形式に整理する
    const exportData = items.map(item => ({
      '仕入れ日': item.purchase_date,
      'メーカー': item.vendor,
      '商品名': item.item_name,
      '単価': item.price,
      '数量': item.quantity,
      '単位': item.unit,
      '小計': item.price * item.quantity,
      '登録日時': new Date(item.created_at).toLocaleString('ja-JP')
    }));

    // 2. ワークブック（Excelファイル全体）とワークシートを作成
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "仕入れ履歴");

    // 3. ファイルを生成してダウンロード実行
    // ファイル名は「仕入れ履歴_2023-10-25.xlsx」のようになります
    const fileName = `仕入れ履歴_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };


  
  const [items, setItems] = useState<any[]>([]);
  // 【重要】編集中のデータのIDを保持する状態（nullなら新規登録モード）
  const [editingId, setEditingId] = useState<string | null>(null);
  const fetchItems = async () => {
    const { data } = await supabase
      .from('purchase_logs')
      .select('*')
      .order('purchase_date', { ascending: false });
    if (data) setItems(data);
  };

  const [existingVendors, setExistingVendors] = useState<string[]>([]);


  useEffect(() => {
  const init = async () => {
    // 1. 認証チェック
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.push('/login');
      return;
    }

    // 2. 認証OKなら、データと「名寄せ用マスタ」を並列で取得
    // Promise.all を使うと効率的です（SE的なパフォーマンス最適化）
    await Promise.all([
      fetchItems(),        // 履歴一覧
      fetchVendorMaster()  // 仕入れ先マスタ（名寄せ用）
    ]);
  };

  init();
}, []);

// --- データの重複排除ロジック ---
const fetchVendorMaster = async () => {
  const { data, error } = await supabase
    .from('purchase_logs')
    .select('vendor');

  if (!error && data) {
    // 全データからユニークな名前だけを抽出
    const uniqueVendors = Array.from(new Set(data.map(d => d.vendor).filter(Boolean)));
    setExistingVendors(uniqueVendors);
    console.log("仕入れ先マスタを更新しました:", uniqueVendors);
  }
};

  // --- 保存（新規作成 または 更新）処理 ---
  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  console.log("送信直前のformData:", formData);

  let error;

  if (editingId) {
    // 【Update】既存データの修正
    const { error: updateError } = await supabase
      .from('purchase_logs')
      .update({ // Updateなので .update() を使う
        purchase_date: formData.date,
        vendor: formData.vendor,
        item_name: formData.itemName,
        price: Number(formData.price),
        quantity: Number(formData.quantity),
        unit: formData.unit
      })
      .eq('id', editingId);
    error = updateError;
  } else {
    // 【Insert】新規データの登録
    const { error: insertError } = await supabase
      .from('purchase_logs')
      .insert([
        {
          purchase_date: formData.date,
          vendor: formData.vendor,
          item_name: formData.itemName,
          price: Number(formData.price),
          quantity: Number(formData.quantity),
          unit: formData.unit
        }
      ]);
    error = insertError;
  }

  if (error) {
    console.error("Supabaseエラー詳細:", error);
    alert('エラーが発生しました: ' + error.message);
  } else {
    alert(editingId ? '更新に成功しました！' : '登録に成功しました！');
    setFormData({ ...formData, vendor: '', itemName: '', price: 0, quantity: 0 });
    setEditingId(null); // 編集モードを解除
    fetchItems();
  }
};

  // --- 編集ボタンを押した時の処理 ---
  const startEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({
      date: item.purchase_date,
      vendor: item.vendor,
      itemName: item.item_name,
      price: item.price,
      quantity: item.quantity,
      unit: item.unit,
    });
    // 画面トップへスクロールさせる
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 削除ボタンを押した時の処理 ---
  const handleDelete = async (id: string) => {
    if (!confirm('本当にこのデータを削除しますか？')) return;

    const { error } = await supabase
      .from('purchase_logs')
      .delete()
      .eq('id', id);

    if (error) alert('削除エラー: ' + error.message);
    else {
      alert('削除しました');
      fetchItems();
    }
  };

  // --- AI解析ロジック ---
  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);

  try {
    // 1. 画像をリサイズしてBase64(純粋データのみ)を取得
    // 原寸大（数MB）が数百KBにまで軽量化されます
    const base64Data = await resizeImage(file, 1200);

      // 2. Gemini APIの準備（URL直接方式）
      const apiKey = (process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();
      if (!apiKey) throw new Error("APIキーが設定されていません。Vercelの設定を確認してください。");
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const prompt = `
  この納品書から「全ての商品」を抽出し、以下のJSON形式の配列で返してください。
  JSON以外のテキストは一切含めないでください。
  [
    {
      "date": "YYYY-MM-DD",
      "vendor": "仕入れ先名",
      "itemName": "商品名1",
      "price": 0,
      "quantity": 1,
      "unit": "単位"
    },
    {
      "date": "YYYY-MM-DD",
      "vendor": "仕入れ先名",
      "itemName": "商品名2",
      "price": 0,
      "quantity": 1,
      "unit": "単位"
    }
  ]
`;

      // 3. fetchで直接送信
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`APIエラー: ${response.status} ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      
      // 4. JSON抽出と反映
      const jsonMatch = rawText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);

      if (!jsonMatch) {
        console.error("Geminiの生回答:", rawText);
        throw new Error("JSONの開始/終了記号が見つかりませんでした。");
      }

      const cleanJson = jsonMatch[0];
      let result;

      try {
        result = JSON.parse(cleanJson);
      } catch (e) {
        console.error("パース失敗時の文字列:", cleanJson);
        throw new Error("JSON形式が崩れています。再撮影してください。");
      }

      const rawItems = Array.isArray(result) ? result : [result];

      const newItems = rawItems.map(item => ({
        id: crypto.randomUUID(),
        date: item.date || new Date().toISOString().split('T')[0],
        vendor: item.vendor || "不明な仕入れ先",
        itemName: item.itemName || "不明な商品名",
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
        unit: item.unit || "個"
      }));

      // 1. スキャン結果から「現在存在しない新しい単位」だけを抽出（重複排除）
const newDetectedUnits = Array.from(new Set(newItems.map(item => item.unit)))
        .filter((u): u is string => !!u && !units.includes(u));

// 2. 新しい単位があれば一括で追加
if (newDetectedUnits.length > 0) {
  setUnits(prev => [...prev, ...newDetectedUnits]);
}

// 3. フォーム反映（連続入力の場合は、最後にスキャンした1件目の単位を代表で表示など）
const displayUnit = newItems[0]?.unit || "BL";


      // リストの先頭に追加（新しいものが一番上に来るように）
      setScannedList(prev => [...newItems, ...prev]);

      // フォーム側にも一応最新を表示させたいなら残してもOK（任意）
     // setFormData(newItem); 

      // --- フィードバック ---
      // newItems[0] を参照することで、少なくとも1件目の名前をログに出せます
      console.log(`${newItems.length}件スキャン完了:`, newItems[0]?.itemName);
      alert(`${newItems.length}件の商品を読み取りました。`);

    } catch (error: any) {
      console.error("解析エラーの詳細:", error);
      alert(`解析失敗エラー：\n${error.message}`);
    } finally {
      // tryが終わってもcatchに飛んでも、必ずスキャン中フラグを落とす
      setIsScanning(false);
    }
  };

  const handleBulkSave = async () => {
  setIsScanning(true); // ローディング表示として流用
  try {
    // Supabaseのカラム名と一致させる
    const inserts = scannedList.map(item => ({
      purchase_date: item.date,
      vendor: item.vendor,
      item_name: item.itemName,
      price: item.price,
      quantity: item.quantity,
      unit: item.unit
    }));

    const { error } = await supabase
      .from('purchase_logs')
      .insert(inserts);

    if (error) throw error;

    alert(`${scannedList.length}件の登録に成功しました！`);
    setScannedList([]); // リストを空にする
    // これにより「初めて登録した会社」が即座に名寄せ辞書に登録されます
    await Promise.all([fetchItems(), fetchVendorMaster()]);
    if (typeof fetchItems === 'function') fetchItems(); // 履歴を更新

  } catch (error: any) {
    alert("DB登録エラー: " + error.message);
  } finally {
    setIsScanning(false);
  }
};

  return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* スキャンボタン */}
        <div className="flex justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className={`flex items-center gap-2 px-6 py-4 rounded-full font-bold text-white shadow-lg transition ${isScanning ? 'bg-gray-400' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-105 active:scale-95'}`}
          >
            <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {isScanning ? "AI解析中..." : "納品書をスキャンして自動入力"}
          </button>
          
          {/* カメラ起動用の隠しinput */}
          <input
            type="file"
            accept="image/*"
            capture="environment" // スマホで直接カメラを起動させる属性
            className="hidden"
            ref={fileInputRef}
            onChange={handleScan}
          />
        </div>
        
        {/* 入力フォーム部分 */}
        <div className={`p-6 shadow-md rounded-xl border-2 transition ${editingId ? 'bg-orange-50 border-orange-200' : 'bg-white border-transparent'}`}>
          <h2 className="text-xl font-bold mb-4 flex justify-between">
            {editingId ? '⚠️ データを編集して更新' : '仕入れデータ登録'}
            {editingId && (
              <button onClick={() => {setEditingId(null); setFormData({...formData, vendor: '', itemName: '', price: 0, quantity: 0});}} className="text-sm font-normal text-gray-500 underline">
                キャンセル
              </button>
            )}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 上段：日付とメーカー（1:1の幅） */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">仕入れ日</label>
            <input
              type="date"
              className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3"
             value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
              required
            />
        </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">メーカー / 仕入れ先</label>
      {/* ★サジェストエリア：既存の existingVendors から5件表示 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
       {existingVendors
        .filter(v => v.includes(formData.vendor)) // 入力文字でフィルタ（任意）
        .slice(0, 8) // 最大8件くらい
        .map(v => (
         <button
            key={v}
            type="button"
           onClick={() => setFormData({ ...formData, vendor: v })}
           className="shrink-0 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium active:bg-blue-200"
          >
            {v}
        </button>
      ))}
     </div>
        <input
         type="text"
          placeholder="例：〇〇水産"
         className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3"
         value={formData.vendor}
         onChange={(e) => setFormData({...formData, vendor: e.target.value})}
         required
         />
    </div>
  </div>

 {/* 商品名入力欄（同様に実装） */}
<div className="mb-4">
  <label className="block text-sm font-bold text-gray-700 mb-1">商品名</label>
  
  {/* ★商品名のサジェスト：historyItems（履歴）から取得 */}
  <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
    {Array.from(new Set(items.map(i => i.item_name))) // 履歴からユニークな商品名を作成
      .filter(name => name.includes(formData.itemName))
      .slice(0, 8)
      .map(name => (
        <button
          key={name}
          type="button"
          onClick={() => setFormData({ ...formData, itemName: name })}
          className="shrink-0 px-3 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-full text-xs font-medium active:bg-gray-200"
        >
          {name}
        </button>
      ))}
  </div>

  <input
    type="text"
    value={formData.itemName}
    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
    placeholder="商品名を入力"
  />
</div>

  {/* 下段：単価・数量・単位（均等に3分割、かつ高さ統一） */}
  <div className="grid grid-cols-3 gap-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-center">単価 (¥)</label>
      <input
        type="number"
        min="0"
        className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3"
        value={formData.price === 0 ? '' : formData.price}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const val = Number(e.target.value);
          setFormData({...formData, price: val < 0 ? 0 : val});
        }}
        required
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-center">数量</label>
      <input
        type="number"
        min="0"
        step="0.1"
        className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3"
        value={formData.quantity === 0 ? '' : formData.quantity}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const val = Number(e.target.value);
          setFormData({...formData, quantity: val < 0 ? 0 : val});
        }}
        required
      />
    </div>
    <div>
      {/* 単位のセレクトボックス部分を修正 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 text-center">単位</label>
        <select
          className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3 bg-white cursor-pointer"
          value={formData.unit}
          onChange={(e) => {
            // 手動入力で「その他」を選ばせる代わりに、直接入力できるようにするのは少し複雑なので
            // まずはAIが追加したリストから選べるようにします
            setFormData({...formData, unit: e.target.value})
          }}
        >
          {/* --- 4. 単位リストから動的に生成 --- */}
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
    </div>
  </div>

  <button
    type="submit"
    className={`w-full mt-4 h-[48px] rounded-md font-bold text-white transition ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}
  >
    {editingId ? '変更を保存（更新）' : '登録する'}
  </button>
</form>
<div className="mt-6 w-full space-y-3">
  {scannedList.map((item) => (
    <div 
      key={item.id} 
      className="w-full p-5 border-2 border-blue-100 rounded-2xl bg-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
    >
      {/* 左側：商品情報（ここを flex-grow で広げる） */}
      <div className="flex-grow w-full">
        <div className="flex justify-between items-start">
          <p className="font-bold text-lg text-blue-900 break-words">
            {item.itemName}
          </p>
          {/* モバイルで右上に削除ボタンを配置したい場合はここ */}
        </div>
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
          <span className="bg-gray-100 px-2 py-0.5 rounded">📅 {item.date}</span>
          <span className="bg-gray-100 px-2 py-0.5 rounded">🏢 {item.vendor}</span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-bold text-gray-900">
            ¥{Number(item.price).toLocaleString()}
          </span>
          <span className="text-gray-500 text-sm">
            ({item.quantity}{item.unit})
          </span>
        </div>
      </div>

      {/* 右側：削除ボタン（モバイルでは右端、PCでは横並び） */}
      <button
        onClick={() => setScannedList(prev => prev.filter(i => i.id !== item.id))}
        className="shrink-0 w-full sm:w-auto px-4 py-2 text-red-500 font-bold border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
      >
        削除
      </button>
    </div>
  ))}
</div>

{/* リストがある時だけ表示される「一括登録ボタン」 */}
{scannedList.length > 0 && (
  <div className="mt-8 space-y-3 w-full">
    {/* メインの登録ボタン */}
    <button
      onClick={handleBulkSave}
      className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 hover:bg-blue-700"
    >
      <span>🚀</span>
      <span>{scannedList.length}件をまとめて登録する</span>
    </button>

    {/* キャンセルボタン（全削除） */}
    <button
      onClick={() => {
        if (confirm("スキャンしたリストをすべて消去してもよろしいですか？")) {
          setScannedList([]);
        }
      }}
      className="w-full bg-white text-gray-500 py-3 rounded-2xl font-medium text-base border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all active:scale-95"
    >
      リストをすべてクリアしてキャンセル
    </button>
  </div>
)}


{/* 履歴セクション */}
 <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
  <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
    <h2 className="text-xl font-bold text-gray-800">仕入れ履歴</h2>
    <button
      onClick={downloadExcel}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-bold transition shadow-sm"
    >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Excel出力
            </button>
          </div>
         {/* --- 1. PC向け: テーブル表示 (md以上で表示) --- */}
  <div className="hidden md:block overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-gray-100 text-gray-600 text-sm">
          <th className="p-4 border-b">日付</th>
          <th className="p-4 border-b">メーカー / 商品</th>
          <th className="p-4 border-b">単価 × 数量</th>
          <th className="p-4 border-b">小計</th>
          <th className="p-4 border-b text-center">操作</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50 border-b transition">
            <td className="p-4 text-sm whitespace-nowrap">{item.purchase_date}</td>
            <td className="p-4">
              <div className="font-medium">{item.vendor}</div>
              <div className="text-xs text-gray-500">{item.item_name}</div>
            </td>
            <td className="p-4 text-sm">
              ¥{item.price.toLocaleString()} × {item.quantity}{item.unit}
            </td>
            <td className="p-4 font-bold text-blue-600">¥{(item.price * item.quantity).toLocaleString()}</td>
            <td className="p-4">
              <div className="flex justify-center gap-2">
                <button onClick={() => startEdit(item)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm border border-blue-200">編集</button>
                <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm border border-red-200">削除</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* --- 2. スマホ向け: カード型表示 (md未満で表示) --- */}
  <div className="block md:hidden divide-y divide-gray-100">
    {items.map((item) => (
      <div key={item.id} className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <span className="text-xs text-gray-400">{item.purchase_date}</span>
          <span className="font-bold text-blue-600">¥{(item.price * item.quantity).toLocaleString()}</span>
        </div>
        <div>
          <div className="text-xs font-bold text-blue-800 bg-blue-50 inline-block px-2 py-0.5 rounded mb-1">{item.vendor}</div>
          <div className="text-sm font-medium text-gray-800 leading-snug">{item.item_name}</div>
        </div>
        <div className="flex justify-between items-center pt-2">
          <div className="text-xs text-gray-500">
             ¥{item.price.toLocaleString()} × {item.quantity}{item.unit}
          </div>
          <div className="flex gap-3">
            <button onClick={() => startEdit(item)} className="text-blue-600 text-sm font-bold">編集</button>
            <button onClick={() => handleDelete(item.id)} className="text-red-500 text-sm font-bold">削除</button>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
</div>
</div>
</div>
  );
}   
