import Head from 'next/head'
import Link from 'next/link'
import Footer from '../components/Footer'

const steps = [
  {
    emoji: '🔍',
    title: 'Pick a Topic',
    desc: "Type anything you're curious about — black holes, ancient Egypt, volcanoes — or choose from our suggestions.",
    color: 'from-indigo-500 to-violet-600',
  },
  {
    emoji: '📖',
    title: 'Read & Explore',
    desc: 'Get a beautifully written article tailored for young learners. Watch an animated story slideshow for even more fun.',
    color: 'from-sky-500 to-blue-600',
  },
  {
    emoji: '🧠',
    title: 'Test Your Knowledge',
    desc: "Take a quick 5-question quiz after reading. See how much you've learned and track your progress over time.",
    color: 'from-emerald-500 to-teal-600',
  },
  {
    emoji: '🏆',
    title: 'Track Progress',
    desc: "Teachers can assign topics, see quiz scores, and follow each student's learning journey in one place.",
    color: 'from-orange-500 to-red-600',
  },
]

const audiences = [
  {
    emoji: '🧒',
    title: 'Students',
    desc: 'Explore any topic you love. Read articles, watch story slideshows, take quizzes, and see your scores grow.',
  },
  {
    emoji: '👨‍🏫',
    title: 'Teachers',
    desc: "Create classes, assign topics to batches, and track every student's quiz scores and reading progress.",
  },
  {
    emoji: '👪',
    title: 'Parents',
    desc: 'Use CurioLab just like a student — no setup needed. Pick a topic and start learning together right now.',
  },
]

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About — CurioLab</title>
        <meta name="description" content="What is CurioLab? Learn how it works and who it's for." />
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
                <Link href="/help" className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold">
                  Help
                </Link>
                <Link href="/feedback" className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold">
                  Feedback
                </Link>
                <Link href="/" className="px-4 py-2 text-sm bg-white text-indigo-700 rounded-lg hover:bg-white/90 transition-colors font-bold">
                  Start Learning
                </Link>
              </div>
            </div>
          </nav>

          <div className="text-center pt-8 pb-28 px-4">
            <div className="text-6xl inline-block animate-float">🦉</div>
            <h1 className="text-4xl sm:text-5xl font-black text-white mt-4 leading-tight">
              What is CurioLab?
            </h1>
            <p className="text-indigo-200 text-lg mt-3 max-w-xl mx-auto">
              An AI-powered learning playground for curious kids — and the adults who guide them.
            </p>
          </div>
        </div>

        {/* Intro card */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 relative z-10 w-full">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
            <p className="text-gray-700 text-lg leading-relaxed">
              CurioLab lets students explore <strong>any topic in the world</strong> — from dinosaurs to dark matter — and
              get a clear, age-friendly article in seconds. Built-in quizzes check understanding, animated story
              slideshows make learning memorable, and a teacher dashboard keeps everyone on track.
            </p>
            <p className="text-gray-500 mt-4 leading-relaxed">
              Whether you're a student exploring on your own, a teacher running a class, or a parent learning alongside
              your child, CurioLab meets you where you are.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex-1 w-full">

          {/* How it works */}
          <section className="mb-16">
            <h2 className="text-2xl font-black text-gray-800 mb-8 text-center">How it works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((step, i) => (
                <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 text-center">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-2xl mx-auto mb-3`}>
                    {step.emoji}
                  </div>
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-1">Step {i + 1}</div>
                  <h3 className="font-black text-gray-800 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Who it's for */}
          <section className="mb-16">
            <h2 className="text-2xl font-black text-gray-800 mb-8 text-center">Who is it for?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {audiences.map((a, i) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="text-4xl mb-3">{a.emoji}</div>
                  <h3 className="font-black text-gray-800 text-lg mb-2">{a.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="text-center">
            <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 rounded-2xl p-10 text-white shadow-xl">
              <div className="text-5xl mb-4">🚀</div>
              <h2 className="text-2xl font-black mb-3">Ready to explore?</h2>
              <p className="text-indigo-200 mb-6 text-lg">No sign-up needed. Just pick a topic and start learning.</p>
              <Link href="/" className="inline-block px-8 py-3 bg-white text-indigo-700 rounded-xl font-bold text-lg hover:bg-white/90 transition-colors shadow-lg">
                Start Learning →
              </Link>
            </div>
          </section>

        </div>

        <Footer />
      </div>
    </>
  )
}
