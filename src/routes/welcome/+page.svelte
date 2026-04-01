<script lang="ts">
  import { onMount } from 'svelte';

  let stats = {
    totalJobs: 0,
    applicationsToday: 0,
    responseRate: 0,
    averageSalary: 0
  };

  let isAnimating = false;

  function animateCounter(element: HTMLElement, start: number, end: number, duration: number = 2000) {
    const startTime = performance.now();
    
    function updateNumber(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const current = Math.floor(start + (end - start) * progress);
      element.textContent = current.toString();
      
      if (progress < 1) {
        requestAnimationFrame(updateNumber);
      }
    }
    
    requestAnimationFrame(updateNumber);
  }

  onMount(() => {
    // Simulate loading stats
    setTimeout(() => {
      stats = {
        totalJobs: 256,
        applicationsToday: 12,
        responseRate: 34,
        averageSalary: 97000
      };
      
      // Animate counters
      const counters = document.querySelectorAll('.stat-number');
      counters.forEach((counter, index) => {
        const values = [256, 12, 34, 97];
        animateCounter(counter as HTMLElement, 0, values[index], 1500 + index * 200);
      });
    }, 500);
  });


</script>

<div class="min-h-screen bg-base-200">
  <div class="hero bg-gradient-to-br from-primary/20 to-secondary/20 py-32">
    <div class="hero-content text-center">
      <div class="max-w-4xl">
        <h1 class="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
          🤖 Quest Bot
        </h1>
        <h2 class="text-2xl md:text-4xl font-bold text-primary mb-6">
          Automated Job Application Assistant
        </h2>
        <p class="text-lg md:text-xl text-base-content/80 max-w-2xl mx-auto">
          Advanced AI-powered job hunting automation for the Australian market.
          Configure once, apply everywhere, track everything.
        </p>
      </div>
    </div>
  </div>

  <div class="container mx-auto px-4 py-16 max-w-7xl">
    <div class="stats shadow mb-16 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
      <div class="stat">
        <div class="stat-figure text-4xl">🔍</div>
        <div class="stat-title">Jobs Discovered</div>
        <div class="stat-value stat-number text-primary">0</div>
      </div>

      <div class="stat">
        <div class="stat-figure text-4xl">📨</div>
        <div class="stat-title">Applied Today</div>
        <div class="stat-value stat-number text-primary">0</div>
      </div>

      <div class="stat">
        <div class="stat-figure text-4xl">📈</div>
        <div class="stat-title">Response Rate %</div>
        <div class="stat-value stat-number text-primary">0</div>
      </div>

      <div class="stat">
        <div class="stat-figure text-4xl">💰</div>
        <div class="stat-title">Avg Salary (K)</div>
        <div class="stat-value stat-number text-primary">0</div>
      </div>
    </div>

    <div class="mb-16">
      <h3 class="text-4xl font-bold text-primary text-center mb-12">🚀 Core Features</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="card-body text-center">
            <div class="text-6xl mb-4">⚡</div>
            <h4 class="card-title text-primary justify-center">Lightning Fast</h4>
            <p class="text-base-content/70">Automated job scraping and application submission across multiple platforms</p>
          </div>
        </div>

        <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="card-body text-center">
            <div class="text-6xl mb-4">🧠</div>
            <h4 class="card-title text-primary justify-center">Smart Matching</h4>
            <p class="text-base-content/70">AI-powered job matching based on your skills, preferences, and career goals</p>
          </div>
        </div>

        <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="card-body text-center">
            <div class="text-6xl mb-4">📊</div>
            <h4 class="card-title text-primary justify-center">Real-time Analytics</h4>
            <p class="text-base-content/70">Track applications, response rates, and optimize your job search strategy</p>
          </div>
        </div>

        <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2">
          <div class="card-body text-center">
            <div class="text-6xl mb-4">🔒</div>
            <h4 class="card-title text-primary justify-center">Secure & Private</h4>
            <p class="text-base-content/70">Your data stays on your machine. Enterprise-grade security and privacy</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card bg-primary/10 shadow-2xl mb-16">
      <div class="card-body text-center py-12">
        <h3 class="text-3xl font-bold text-primary mb-8">Ready to Supercharge Your Job Hunt?</h3>
        <div class="flex gap-4 justify-center flex-wrap">
          <a href="/frontend-form" class="btn btn-primary btn-lg">
            ⚙️ Configure Bot
          </a>
          <a href="/control-bar" class="btn btn-secondary btn-lg">
            🎮 Control Panel
          </a>
        </div>
      </div>
    </div>

    <div class="text-center">
      <h4 class="text-2xl font-bold text-primary mb-8">Supported Job Platforms</h4>
      <div class="flex justify-center gap-6 flex-wrap">
        <div class="card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div class="card-body items-center p-6">
            <img src="/finalseek.png" alt="Seek" class="w-16 h-16 object-contain mb-2" />
            <span class="font-bold text-primary">Seek</span>
          </div>
        </div>
        <div class="card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div class="card-body items-center p-6">
            <img src="/finallinkedin.png" alt="LinkedIn" class="w-16 h-16 object-contain mb-2" />
            <span class="font-bold text-primary">LinkedIn</span>
          </div>
        </div>
        <div class="card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <div class="card-body items-center p-6">
            <img src="/finalindeed.png" alt="Indeed" class="w-16 h-16 object-contain mb-2" />
            <span class="font-bold text-primary">Indeed</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

