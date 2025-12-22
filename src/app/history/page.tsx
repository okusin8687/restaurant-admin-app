'use client';

import { useState, useEffect } from 'react';
// ライブラリを直接インポート
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ITEMS_PER_PAGE = 30;

export default function HistoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // 検索用State
  const [keyword, setKeyword] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [existingVendors, setExistingVendors] = useState<string[]>([]);

  useEffect(() => {
    fetchHistory();
    fetchVendors();
  }, [page, selectedVendor, selectedMonth]); // キーワード以外は即時反映

  const fetchVendors = async () => {
    const { data } = await supabase.from('purchase_logs').select('vendor');
    if (data) setExistingVendors(Array.from(new Set(data.map(d => d.vendor))));
  };

  const fetchHistory = async () => {
    setLoading(true);
    let query = supabase
      .from('purchase_logs')
      .select('*', { count: 'exact' })
      .order('purchase_date', { ascending: false });

    // フィルタリング
    if (keyword) query = query.ilike('item_name', `%${keyword}%`);
    if (selectedVendor) query = query.eq('vendor', selectedVendor);
    if (selectedMonth) {
      query = query.gte('purchase_date', `${selectedMonth}-01`)
                   .lte('purchase_date', `${selectedMonth}-31`);
    }

    // ページネーション
    const from = page * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    const { data, count, error } = await query.range(from, to);

    if (!error && data) {
      setItems(data);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/" className="text-blue-600 font-bold">← 戻る</Link>
        <h1 className="text-2xl font-bold">全仕入れ履歴検索</h1>
      </div>

      {/* 検索・絞り込みエリア */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setPage(0); }}
            className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select 
            value={selectedVendor}
            onChange={(e) => { setSelectedVendor(e.target.value); setPage(0); }}
            className="p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全てのメーカー</option>
            {existingVendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="商品名で検索..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="flex-grow p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => { setPage(0); fetchHistory(); }} className="bg-blue-600 text-white px-4 rounded-xl font-bold">検索</button>
          </div>
        </div>
      </div>

      {/* 履歴表示 (以前作ったカード形式を再利用) */}
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="w-full p-4 bg-white border border-gray-100 rounded-xl shadow-sm flex justify-between items-center">
             <div>
               <p className="text-xs text-blue-600 font-bold">{item.vendor} | {item.purchase_date}</p>
               <p className="font-bold">{item.item_name}</p>
               <p className="text-sm text-gray-500">¥{item.price.toLocaleString()} × {item.quantity}</p>
             </div>
             <div className="text-right">
               <p className="text-lg font-black text-blue-700">¥{(item.price * item.quantity).toLocaleString()}</p>
             </div>
          </div>
        ))}
      </div>

      {/* ページネーションコントロール */}
      <div className="mt-8 flex justify-center items-center gap-6">
        <button 
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
          className="px-6 py-2 bg-white border rounded-full font-bold disabled:opacity-30 shadow-sm"
        >
          前へ
        </button>
        <span className="font-medium text-gray-600">
          {page + 1} / {Math.ceil(totalCount / ITEMS_PER_PAGE)} ページ
        </span>
        <button 
          disabled={(page + 1) * ITEMS_PER_PAGE >= totalCount}
          onClick={() => setPage(p => p + 1)}
          className="px-6 py-2 bg-white border rounded-full font-bold disabled:opacity-30 shadow-sm"
        >
          次へ
        </button>
      </div>
    </div>
  );
}