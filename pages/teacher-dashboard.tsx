import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useAuth } from '../contexts/AuthContext'
import Footer from '../components/Footer'

interface ClassItem {
  id: number
  name: string
  created_at: string
  batch_count: number
}

interface Batch {
  id: number
  name: string
  created_at: string
  student_count: number
  topic_count: number
}

interface Student {
  id: number
  email: string
  name: string
}

interface TopicItem {
  topic: string
  assigned_at: string
}

interface StudentProgress {
  student_id: number
  email: string
  name: string
  topics: { topic: string; completed: boolean; quiz_score: number | null; quiz_total: number | null }[]
}

export default function TeacherDashboard() {
  const { user, token, isAuthenticated, isLoading, role, logout } = useAuth()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [batchTab, setBatchTab] = useState<'students' | 'topics' | 'progress'>('students')
  const [students, setStudents] = useState<Student[]>([])
  const [topics, setTopics] = useState<TopicItem[]>([])
  const [progress, setProgress] = useState<StudentProgress[]>([])
  const [progressTopics, setProgressTopics] = useState<string[]>([])

  const [newClassName, setNewClassName] = useState('')
  const [newBatchName, setNewBatchName] = useState('')
  const [newStudentEmail, setNewStudentEmail] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [feedback, setFeedback] = useState('')

  // Auth guard
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || role !== 'teacher')) {
      window.location.href = '/'
    }
  }, [isLoading, isAuthenticated, role])

  useEffect(() => {
    if (isAuthenticated && role === 'teacher') {
      fetchClasses()
    }
  }, [isAuthenticated, role])

  useEffect(() => {
    if (selectedClass) fetchBatches(selectedClass.id)
  }, [selectedClass])

  useEffect(() => {
    if (selectedBatch) {
      fetchStudents(selectedBatch.id)
      fetchTopics(selectedBatch.id)
    }
  }, [selectedBatch])

  useEffect(() => {
    if (selectedBatch && batchTab === 'progress') {
      fetchProgress(selectedBatch.id)
    }
  }, [batchTab, selectedBatch])

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  })

  const fetchClasses = async () => {
    const res = await fetch(`${API_URL}/teacher/classes`, { headers: authHeaders() })
    if (res.ok) setClasses(await res.json())
  }

  const fetchBatches = async (classId: number) => {
    const res = await fetch(`${API_URL}/teacher/classes/${classId}/batches`, { headers: authHeaders() })
    if (res.ok) setBatches(await res.json())
  }

  const fetchStudents = async (batchId: number) => {
    const res = await fetch(`${API_URL}/teacher/batches/${batchId}/students`, { headers: authHeaders() })
    if (res.ok) setStudents(await res.json())
  }

  const fetchTopics = async (batchId: number) => {
    const res = await fetch(`${API_URL}/teacher/batches/${batchId}/topics`, { headers: authHeaders() })
    if (res.ok) setTopics(await res.json())
  }

  const fetchProgress = async (batchId: number) => {
    const res = await fetch(`${API_URL}/teacher/batches/${batchId}/progress`, { headers: authHeaders() })
    if (res.ok) {
      const data = await res.json()
      setProgress(data.students)
      setProgressTopics(data.topics)
    }
  }

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    const res = await fetch(`${API_URL}/teacher/classes`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newClassName.trim() })
    })
    if (res.ok) {
      setNewClassName('')
      fetchClasses()
      showFeedback('Class created!')
    }
  }

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBatchName.trim() || !selectedClass) return
    const res = await fetch(`${API_URL}/teacher/classes/${selectedClass.id}/batches`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newBatchName.trim() })
    })
    if (res.ok) {
      setNewBatchName('')
      fetchBatches(selectedClass.id)
      showFeedback('Batch created!')
    }
  }

  const assignStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStudentEmail.trim() || !selectedBatch) return
    const res = await fetch(`${API_URL}/teacher/batches/${selectedBatch.id}/students`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ student_email: newStudentEmail.trim() })
    })
    if (res.ok) {
      setNewStudentEmail('')
      fetchStudents(selectedBatch.id)
      showFeedback('Student added!')
    } else {
      const err = await res.json()
      showFeedback(err.detail || 'Student not found', true)
    }
  }

  const removeStudent = async (studentId: number) => {
    if (!selectedBatch) return
    await fetch(`${API_URL}/teacher/batches/${selectedBatch.id}/students/${studentId}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    fetchStudents(selectedBatch.id)
  }

  const assignTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTopic.trim() || !selectedBatch) return
    const res = await fetch(`${API_URL}/teacher/batches/${selectedBatch.id}/topics`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ topic: newTopic.trim() })
    })
    if (res.ok) {
      setNewTopic('')
      fetchTopics(selectedBatch.id)
      showFeedback('Topic assigned!')
    }
  }

  const removeTopic = async (topic: string) => {
    if (!selectedBatch) return
    await fetch(`${API_URL}/teacher/batches/${selectedBatch.id}/topics/${encodeURIComponent(topic)}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    fetchTopics(selectedBatch.id)
  }

  const showFeedback = (msg: string, isError = false) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 3000)
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
    </div>
  }

  return (
    <>
      <Head><title>Teacher Dashboard - CurioLab</title></Head>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <a href="/" className="text-xl font-bold text-gray-900">🦉 CurioLab</a>
                <span className="text-sm bg-green-100 text-green-700 px-2 py-1 rounded-full">Teacher</span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600">Hi, {user?.name || user?.email}!</span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-red-600 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        {feedback && (
          <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
            {feedback}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Column 1: Classes */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">My Classes</h2>
              <form onSubmit={createClass} className="flex gap-2 mb-4">
                <input
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="Class name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <button type="submit" className="px-3 py-2 bg-green-500 text-white rounded-md text-sm hover:bg-green-600">
                  Add
                </button>
              </form>
              <div className="space-y-2">
                {classes.length === 0 && <p className="text-sm text-gray-400">No classes yet.</p>}
                {classes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedClass(c); setSelectedBatch(null) }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      selectedClass?.id === c.id ? 'bg-green-50 border border-green-300 text-green-800' : 'hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.batch_count} batch{c.batch_count !== 1 ? 'es' : ''}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Column 2: Batches */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {selectedClass ? `Batches — ${selectedClass.name}` : 'Batches'}
              </h2>
              {selectedClass ? (
                <>
                  <form onSubmit={createBatch} className="flex gap-2 mb-4">
                    <input
                      value={newBatchName}
                      onChange={e => setNewBatchName(e.target.value)}
                      placeholder="Batch name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <button type="submit" className="px-3 py-2 bg-green-500 text-white rounded-md text-sm hover:bg-green-600">
                      Add
                    </button>
                  </form>
                  <div className="space-y-2">
                    {batches.length === 0 && <p className="text-sm text-gray-400">No batches yet.</p>}
                    {batches.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedBatch(b); setBatchTab('students') }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedBatch?.id === b.id ? 'bg-blue-50 border border-blue-300 text-blue-800' : 'hover:bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-gray-500">{b.student_count} students · {b.topic_count} topics</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">Select a class to see batches.</p>
              )}
            </div>

            {/* Column 3: Batch detail */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {selectedBatch ? selectedBatch.name : 'Batch Detail'}
              </h2>
              {selectedBatch ? (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-gray-200 mb-4">
                    {(['students', 'topics', 'progress'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setBatchTab(tab)}
                        className={`px-3 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                          batchTab === tab
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Students tab */}
                  {batchTab === 'students' && (
                    <>
                      <form onSubmit={assignStudent} className="flex gap-2 mb-4">
                        <input
                          value={newStudentEmail}
                          onChange={e => setNewStudentEmail(e.target.value)}
                          placeholder="Student email"
                          type="email"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <button type="submit" className="px-3 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600">
                          Add
                        </button>
                      </form>
                      <div className="space-y-2">
                        {students.length === 0 && <p className="text-sm text-gray-400">No students yet.</p>}
                        {students.map(s => (
                          <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-md">
                            <div>
                              <div className="text-sm font-medium text-gray-800">{s.name || s.email}</div>
                              {s.name && <div className="text-xs text-gray-500">{s.email}</div>}
                            </div>
                            <button
                              onClick={() => removeStudent(s.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Topics tab */}
                  {batchTab === 'topics' && (
                    <>
                      <form onSubmit={assignTopic} className="flex gap-2 mb-4">
                        <input
                          value={newTopic}
                          onChange={e => setNewTopic(e.target.value)}
                          placeholder="e.g. Dinosaurs"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <button type="submit" className="px-3 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600">
                          Assign
                        </button>
                      </form>
                      <div className="space-y-2">
                        {topics.length === 0 && <p className="text-sm text-gray-400">No topics assigned yet.</p>}
                        {topics.map(t => (
                          <div key={t.topic} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-md">
                            <span className="text-sm font-medium text-gray-800 capitalize">{t.topic}</span>
                            <button
                              onClick={() => removeTopic(t.topic)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Progress tab */}
                  {batchTab === 'progress' && (
                    <div className="overflow-x-auto">
                      {progress.length === 0 ? (
                        <p className="text-sm text-gray-400">No students or topics yet.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="text-left py-2 pr-3 text-gray-600 font-medium">Student</th>
                              {progressTopics.map(t => (
                                <th key={t} className="text-center py-2 px-2 text-gray-600 font-medium capitalize text-xs">{t}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {progress.map(s => (
                              <tr key={s.student_id} className="border-t border-gray-100">
                                <td className="py-2 pr-3">
                                  <div className="font-medium text-gray-800">{s.name || s.email}</div>
                                  {s.name && <div className="text-xs text-gray-400">{s.email}</div>}
                                </td>
                                {s.topics.map(t => (
                                  <td key={t.topic} className="text-center py-2 px-2">
                                    {t.completed ? (
                                      <span className="text-green-600 font-medium text-xs">
                                        {t.quiz_score !== null ? `✓ ${t.quiz_score}/${t.quiz_total}` : '✓'}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Select a batch to manage it.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
