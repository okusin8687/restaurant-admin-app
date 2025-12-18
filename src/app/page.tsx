"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx'; // 【追加】Excelライブラリのインポー
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function PurchaseForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    itemName: '',
    price: 0,
    quantity: 0,
    unit: 'BL',
  });

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

    if (editingId) {
      // 【Update】既存データの修正
      const { error } = await supabase
        .from('purchase_logs')
        .update({
          purchase_date: formData.date,
          vendor: formData.vendor,
          item_name: formData.itemName,
          price: formData.price,
          quantity: formData.quantity,
          unit: formData.unit
        })
        .eq('id', editingId); // C言語でいうところの「ポインタ指定」に近い

      if (error) alert('更新エラー: ' + error.message);
      else {
        alert('データを更新しました');
        setEditingId(null); // 編集モード終了
      }
    } else {
      // 【Create】新規登録
      const { error } = await supabase.from('purchase_logs').insert([formData]);
      if (error) alert('登録エラー: ' + error.message);
      else alert('保存しました');
    }

    setFormData({ ...formData, vendor: '', itemName: '', price: 0, quantity: 0 });
    fetchItems();
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

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        
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
      <label className="block text-sm font-medium text-gray-700 mb-1 text-center">単位</label>
      <select
        className="block w-full h-[42px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border px-3 bg-white cursor-pointer"
        value={formData.unit}
        onChange={(e) => setFormData({...formData, unit: e.target.value})}
      >
        <option value="BL">BL</option>
        <option value="PK">PK</option>
        <option value="C/S">C/S</option>
        <option value="KG">KG</option>
      </select>
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