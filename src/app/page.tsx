"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx'; // 【追加】Excelライブラリのインポー
import { useRouter } from 'next/navigation';
import { GoogleGenerativeAI } from "@google/generative-ai";

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

  useEffect(() => {
  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login'); // セッションがなければログイン画面へ
    } else {
      fetchItems(); // ログインしていればデータ取得
    }
  };
  checkAuth();
}, []);

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
      // 1. 画像をBase64に変換（Promiseをここで完結させる）
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });

      // 2. Gemini APIの準備（URL直接方式）
      const apiKey = (process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();
      if (!apiKey) throw new Error("APIキーが設定されていません。Vercelの設定を確認してください。");
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`;

      const prompt = `
        この納品書（または領収書）の画像から情報を抽出し、純粋なJSON形式で返してください。
        JSON以外の説明テキストは一切含めないでください。
        {
          "date": "YYYY-MM-DD",
          "vendor": "仕入れ先名",
          "itemName": "商品名",
          "price": 0,
          "quantity": 1,
          "unit": "単位"
        }
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
              { inline_data: { mime_type: file.type, data: base64Data.split(',')[1] } }
            ]
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`APIエラー: ${response.status} ${JSON.stringify(errorData)}`);
      }
      
      const result = await response.json();
      const responseText = result.candidates[0].content.parts[0].text;
      
      // 4. JSON抽出と反映
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("AIの回答からJSONが見つかりませんでした");

      const data = JSON.parse(jsonMatch[0]);
      const detectedUnit = data.unit || "BL";

      // 単位の追加とフォーム反映
      if (!units.includes(detectedUnit)) {
        setUnits(prev => [...prev, detectedUnit]);
      }

      setFormData({
        date: data.date || new Date().toISOString().split('T')[0],
        vendor: data.vendor || "不明な仕入れ先",
        itemName: data.itemName || "不明な商品名",
        price: Number(data.price) || 0,
        quantity: Number(data.quantity) || 1,
        unit: detectedUnit
      });

      alert(`スキャン完了！単位「${detectedUnit}」を認識しました。`);

    } catch (error: any) {
      console.error("解析エラーの詳細:", error);
      alert(`解析失敗エラー：\n${error.message}`);
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

  {/* 中段：商品名（1行まるごと使用） */}
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">商品名</label>
    <input
      type="text"
      placeholder="例：ノルウェー産サーモン"
      className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3"
      value={formData.itemName}
      onChange={(e) => setFormData({...formData, itemName: e.target.value})}
      required
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
        </div>

        {/* 履歴テーブル */}
        <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
          <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800">仕入れ履歴</h2>
            
            {/* 【追加】Excelダウンロードボタン */}
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
          <div className="overflow-x-auto">
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
                    <td className="p-4 text-sm">{item.purchase_date}</td>
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
                        <button onClick={() => startEdit(item)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm border border-blue-200">
                          編集
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm border border-red-200">
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}