import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-indigo-600">🦉 CurioLab</span>
            <span className="text-sm text-gray-400">— Curiosity starts here</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/about" className="text-gray-500 hover:text-indigo-600 transition-colors font-semibold">
              About
            </Link>
            <Link href="/help" className="text-gray-500 hover:text-indigo-600 transition-colors font-semibold">
              Help
            </Link>
            <Link href="/feedback" className="text-gray-500 hover:text-indigo-600 transition-colors font-semibold">
              Feedback
            </Link>
          </nav>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} CurioLab</p>
        </div>
      </div>
    </footer>
  )
}
