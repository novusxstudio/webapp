export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-gray-100 font-sans">
      <header className="flex justify-between items-center px-8 py-4 border-b border-neutral-800">
        <h1 className="text-2xl font-bold text-indigo-400">Novus X Studio</h1>
        <nav className="space-x-6">
          <a href="#projects" className="hover:text-indigo-400 transition">Projects</a>
          <a href="#about" className="hover:text-indigo-400 transition">About</a>
          <a href="#contact" className="hover:text-indigo-400 transition">Contact</a>
        </nav>
      </header>

      <main className="flex flex-col items-center justify-center text-center py-32 px-6">
        <h2 className="text-5xl font-semibold mb-6">
          Crafting Ideas Into <span className="text-indigo-400">Reality</span>
        </h2>
        <p className="text-gray-400 max-w-xl leading-relaxed">
          I’m Andrew, a creative engineer building tools, visuals, and experiences that blend
          technology and imagination.
        </p>
        <div className="mt-10">
          <a
            href="#projects"
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-lg text-white font-medium shadow transition"
          >
            View My Work
          </a>
        </div>
      </main>
    </div>
  )
}
