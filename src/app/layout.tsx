import Link from 'next/link'; // ページ遷移用のコンポーネント
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">
        {/* メニューバー（ナビゲーション） */}
        <nav className="bg-blue-700 text-white shadow-md">
          <div className="max-w-4xl mx-auto flex items-center justify-between p-4">
            
            {/* タイトルエリア */}
            <div className="flex flex-col">
              <h1 className="font-black text-lg md:text-xl tracking-tight leading-tight">
                店舗管理システム
              </h1>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-pulse"></span>
                <span className="text-[10px] md:text-xs font-medium text-blue-100 tracking-[0.2em] uppercase">
                  寿会館
                </span>
              </div>
            </div>

            {/* ナビゲーションリンク */}
            <div className="flex space-x-4 md:space-x-6 font-medium text-sm md:text-base">
              <Link href="/" className="hover:text-blue-200 transition">仕入れ入力</Link>
              <Link href="/analysis" className="hover:text-blue-200 transition">分析グラフ</Link>
            </div>
          </div>
        </nav>

        {/* 各ページの中身がここに表示される */}
        <main className="max-w-4xl mx-auto">{children}</main>
      </body>
    </html>
  );
}