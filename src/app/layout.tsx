import Link from 'next/link'; // ページ遷移用のコンポーネント
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">
        {/* メニューバー（ナビゲーション） */}
        <nav className="bg-blue-700 text-white shadow-md">
          <div className="max-w-4xl mx-auto flex items-center justify-between p-4">
            <h1 className="font-bold text-xl tracking-tight">飲食店管理システム</h1>
            <div className="space-x-6 font-medium">
              <Link href="/" className="hover:text-blue-200 transition">仕入れ入力</Link>
              <Link href="/analysis" className="hover:text-blue-200 transition">分析グラフ</Link>
            </div>
          </div>
        </nav>

        {/* 各ページの中身がここに表示される */}
        <main>{children}</main>
      </body>
    </html>
  );
}