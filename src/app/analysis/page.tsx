"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend 
} from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type ViewMode = 'daily' | 'monthly' | 'yearly';

export default function AnalysisPage() {
  const [items, setItems] = useState<any[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>(''); // 追加：選択中のメーカー
  const [selectedItemName, setSelectedItemName] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  useEffect(() => {
    const fetchItems = async () => {
      const { data } = await supabase.from('purchase_logs').select('*');
      if (data && data.length > 0) {
        setItems(data);
        // 初期値設定
        const firstVendor = data[0].vendor;
        setSelectedVendor(firstVendor);
        setSelectedItemName(data[0].item_name);
      }
    };
    fetchItems();
  }, []);

  // --- 【ロジック】メーカー一覧の抽出 ---
  const uniqueVendors = useMemo(() => {
    return Array.from(new Set(items.map(i => i.vendor)));
  }, [items]);

  // --- 【ロジック】選択されたメーカーに紐づく食材一覧の抽出 ---
  const filteredIngredients = useMemo(() => {
    const ingredients = items
      .filter(i => i.vendor === selectedVendor)
      .map(i => i.item_name);
    return Array.from(new Set(ingredients));
  }, [items, selectedVendor]);

  // メーカー変更時に、そのメーカーの1番目の食材を自動選択する
  const handleVendorChange = (vendor: string) => {
    setSelectedVendor(vendor);
    const firstIngredient = items.find(i => i.vendor === vendor)?.item_name;
    if (firstIngredient) setSelectedItemName(firstIngredient);
  };

  // グラフ用データ集計（前回同様）
  const timeSeriesData = useMemo(() => {
    const sortedItems = [...items].sort((a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime());
    const summary = sortedItems.reduce((acc: any, cur) => {
      let key = cur.purchase_date;
      if (viewMode === 'monthly') key = key.substring(0, 7);
      else if (viewMode === 'yearly') key = key.substring(0, 4);
      acc[key] = (acc[key] || 0) + (Number(cur.price) * Number(cur.quantity));
      return acc;
    }, {});
    return Object.keys(summary).map(key => ({ period: key, total: summary[key] }));
  }, [items, viewMode]);

  const lineChartData = useMemo(() => {
    return items
      .filter(i => i.item_name === selectedItemName && i.vendor === selectedVendor)
      .sort((a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime())
      .map(i => ({ date: i.purchase_date, price: i.price }));
  }, [items, selectedItemName, selectedVendor]);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">仕入れ分析ダッシュボード</h2>

      {/* 1. 総仕入れ額の推移（前回同様） */}
      <div className="bg-white p-6 shadow rounded-xl border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-semibold text-gray-700">総仕入れ額の推移</h3>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {(['daily', 'monthly', 'yearly'] as ViewMode[]).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-4 py-1 rounded-md text-xs font-medium ${viewMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                {mode === 'daily' ? '日次' : mode === 'monthly' ? '月次' : '年次'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64"><ResponsiveContainer><BarChart data={timeSeriesData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="period"/><YAxis/><Tooltip/><Bar dataKey="total" fill="#4f46e5" radius={[4, 4, 0, 0]}/></BarChart></ResponsiveContainer></div>
      </div>

      {/* 2. 食材別 価格推移（今回アップグレード） */}
      <div className="bg-white p-6 shadow rounded-xl border border-gray-100">
        <h3 className="font-semibold text-gray-700 mb-6">食材別・価格推移分析</h3>
        
        <div className="space-y-6">
          {/* メーカー選択ボタン */}
          <div>
            <p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">1. メーカーを選択</p>
            <div className="flex flex-wrap gap-2">
              {uniqueVendors.map(vendor => (
                <button
                  key={vendor}
                  onClick={() => handleVendorChange(vendor)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                    selectedVendor === vendor 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                  }`}
                >
                  {vendor}
                </button>
              ))}
            </div>
          </div>

          {/* 食材選択ボタン */}
          <div>
            <p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-wider">2. 食材を選択</p>
            <div className="flex flex-wrap gap-2">
              {filteredIngredients.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedItemName(name)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    selectedItemName === name 
                    ? 'bg-emerald-600 text-white border-emerald-600' 
                    : 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* グラフ表示 */}
          <div className="h-80 pt-4">
            {lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(val: any) => [`¥${val.toLocaleString()}`, "単価"]} />
                  <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={3} dot={{r:6}} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">メーカーと食材を選択してください</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}