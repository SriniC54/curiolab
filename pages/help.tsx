import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import Footer from '../components/Footer'

type Role = 'student' | 'teacher' | 'parent'

const guides: Record<Role, { question: string; answer: string }[]> = {
  student: [
    {
      question: 'How do I start learning a topic?',
      answer: 'Go to the home page and type any topic in the search box — or click one of the suggestion tiles. CurioLab will generate an article just for you in seconds.',
    },
    {
      question: 'What is the quiz and how does it work?',
      answer: "After reading an article, click \"Test Your Knowledge\". You'll get 5 multiple-choice questions about what you just read. Answer all 5 and submit to see your score.",
    },
    {
      question: 'What is the Story Player?',
      answer: "Click \"▶ Watch Story\" in the topic banner to watch an animated slideshow of the article with real photos and narration. It's a fun way to absorb the content.",
    },
    {
      question: 'Do I need to create an account?',
      answer: 'No! You can explore topics and read articles without signing in. Creating a free account lets you save your quiz scores and see your progress over time.',
    },
    {
      question: 'How do I see my assigned topics?',
      answer: "Sign in and visit \"My Assignments\" in the nav bar. You'll see all topics your teacher has assigned and your quiz scores for each one.",
    },
    {
      question: 'What does "Explorer" level mean?',
      answer: "All articles are written at the Explorer level — clear, engaging language that's easy to understand without being too simple. Perfect for curious kids and adults alike.",
    },
  ],
  teacher: [
    {
      question: 'How do I set up my class?',
      answer: 'Sign in as a teacher and go to the Teacher Dashboard. Click "New Class" to create a class, then add one or more batches (groups) within it.',
    },
    {
      question: 'How do I add students to a batch?',
      answer: "Open a batch and use the \"Add Student\" field. Search by the student's email address and add them. Students need to have a CurioLab account first.",
    },
    {
      question: 'How do I assign topics?',
      answer: 'Inside a batch, go to the "Topics" tab and type a topic to assign it. All students in that batch will see the topic in their Assignments page.',
    },
    {
      question: 'How do I track student progress?',
      answer: "Open a batch and go to the \"Progress\" tab. You'll see each student's quiz score for every assigned topic — shown as \"✓ 4/5\" when completed.",
    },
    {
      question: 'Can a student be in more than one batch?',
      answer: 'Yes. You can add the same student to multiple batches across your classes.',
    },
    {
      question: 'Can parents use the teacher dashboard?',
      answer: 'The teacher dashboard is designed for teachers. Parents can use the app as a student — explore topics, take quizzes, and view progress without a teacher account.',
    },
  ],
  parent: [
    {
      question: 'Do I need to create an account?',
      answer: "No account needed to start! Just open CurioLab, type a topic your child is curious about, and explore together. Sign up if you'd like to save quiz scores.",
    },
    {
      question: 'Is CurioLab safe for children?',
      answer: 'Yes. All content is AI-generated and tailored for young learners. Articles are factual, age-appropriate, and free of advertising or external links.',
    },
    {
      question: 'What age group is this for?',
      answer: 'CurioLab is designed for primary and middle school learners (roughly ages 7–14), but the content is enjoyable for anyone who loves learning.',
    },
    {
      question: 'How can I use CurioLab as a parent?',
      answer: "Just use it like a student! Pick a topic together, read the article, watch the story slideshow, and take the quiz. It's a great activity for family learning time.",
    },
    {
      question: "My child's school uses CurioLab — what do they need?",
      answer: 'Your child just needs a student account with their email. The teacher will add them to a class and assign topics. Everything else is handled in the app.',
    },
    {
      question: 'Is there a mobile app?',
      answer: 'CurioLab works great in any mobile browser — no app download needed. Just open the website on your phone or tablet.',
    },
  ],
}

const tabs: { id: Role; label: string; emoji: string }[] = [
  { id: 'student', label: 'Students', emoji: '🧒' },
  { id: 'teacher', label: 'Teachers', emoji: '👨‍🏫' },
  { id: 'parent', label: 'Parents', emoji: '👪' },
]

function FAQ({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex justify-between items-center py-4 gap-4 hover:text-indigo-600 transition-colors"
      >
        <span className="font-semibold text-gray-800 text-sm sm:text-base">{question}</span>
        <span className={`text-indigo-400 text-xl font-bold flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <p className="text-gray-500 text-sm pb-4 leading-relaxed animate-fade-in">{answer}</p>
      )}
    </div>
  )
}

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState<Role>('student')

  return (
    <>
      <Head>
        <title>Help — CurioLab</title>
        <meta name="description" content="Help guides for students, teachers, and parents using CurioLab." />
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
                <Link href="/feedback" className="px-3 py-1 text-sm bg-white/20 text-white rounded-full hover:bg-white/30 transition-colors font-semibold">
                  Feedback
                </Link>
                <Link href="/" className="px-4 py-2 text-sm bg-white text-indigo-700 rounded-lg hover:bg-white/90 transition-colors font-bold">
                  Start Learning
                </Link>
              </div>
            </div>
          </nav>

          <div className="text-center pt-8 pb-24 px-4">
            <div className="text-5xl mb-3">❓</div>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">Help Center</h1>
            <p className="text-indigo-200 text-lg mt-3 max-w-lg mx-auto">
              Find answers to common questions, organized by who you are.
            </p>
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-12 relative z-10 pb-16 flex-1 w-full">

          {/* Tabs */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex border-b border-gray-100">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    activeTab === tab.id
                      ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-6 sm:p-8">
              {guides[activeTab].map((faq, i) => (
                <FAQ key={i} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>

          {/* Still stuck? */}
          <div className="mt-8 bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
            <p className="text-gray-600 font-semibold mb-3">Still have questions?</p>
            <Link href="/feedback" className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm">
              Send us a message →
            </Link>
          </div>

        </div>

        <Footer />
      </div>
    </>
  )
}
