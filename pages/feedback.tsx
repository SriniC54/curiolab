import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import Footer from '../components/Footer'

const roles = ['Student', 'Teacher', 'Parent', 'Other']

export default function FeedbackPage() {
  const [form, setForm] = useState({ name: '', email: '', role: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('http://localhost:8000/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          email: form.email || null,
          role: form.role || null,
          message: form.message,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <Head>
        <title>Feedback — CurioLab</title>
        <meta name="description" content="Share your thoughts, suggestions, or report an issue with CurioLab." />
      </Head>

      <div className="min-h-screen bg-[#f8f7ff] flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="text-xl font-black text-white hover:opacity-90 transition-opacity">
                🦉 CurioLab
              </Link>
              <div className="flex items-center gap-3">
                <Link href="/about" className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold">
                  About
                </Link>
                <Link href="/help" className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold">
                  Help
                </Link>
                <Link href="/" className="px-4 py-2 text-sm bg-white text-indigo-700 rounded-lg hover:bg-white/90 transition-colors font-bold">
                  Start Learning
                </Link>
              </div>
            </div>
          </nav>

          <div className="text-center pt-8 pb-24 px-4">
            <div className="text-5xl mb-3">💬</div>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">Share your thoughts</h1>
            <p className="text-indigo-200 text-lg mt-3 max-w-lg mx-auto">
              We'd love to hear what you think — suggestions, bugs, or just a kind note!
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 -mt-12 relative z-10 pb-16 flex-1 w-full">

          {status === 'sent' ? (
            <div className="bg-white rounded-2xl shadow-xl p-10 text-center animate-fade-in-up">
              <div className="text-6xl mb-4 animate-float inline-block">🎉</div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">Thank you!</h2>
              <p className="text-gray-500 mb-6">Your feedback has been received. We really appreciate it.</p>
              <Link href="/" className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">
                Back to learning →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-5">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Name <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-gray-800 bg-gray-50 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-gray-800 bg-gray-50 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">I am a...</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, role: form.role === r ? '' : r })}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all ${
                        form.role === r
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  required
                  rows={5}
                  placeholder="Tell us what you think, what could be better, or report an issue..."
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-400 focus:outline-none text-gray-800 bg-gray-50 text-sm resize-none"
                />
              </div>

              {status === 'error' && (
                <p className="text-red-500 text-sm text-center">Something went wrong. Please try again.</p>
              )}

              <button
                type="submit"
                disabled={!form.message.trim() || status === 'sending'}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'sending' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Feedback'
                )}
              </button>

            </form>
          )}
        </div>

        <Footer />
      </div>
    </>
  )
}
