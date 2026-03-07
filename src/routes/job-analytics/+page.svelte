<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { authService } from "$lib/authService.js";
  import { tokenService } from "$lib/services/tokenService.js";
  import { getManagedFiles } from "$lib/file-manager";
  import { goto } from "$app/navigation";
  import { invoke } from "@tauri-apps/api/core";
  import {
    Chart,
    Title,
    Tooltip,
    Legend,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Filler,
    BarController,
    LineController,
  } from "chart.js";

  Chart.register(
    Title,
    Tooltip,
    Legend,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Filler,
    BarController,
    LineController,
  );

  function chartAction(node, config) {
    let chartInstance = new Chart(node, config);
    return {
      update(newConfig) {
        chartInstance.data = newConfig.data;
        chartInstance.options = newConfig.options;
        chartInstance.update();
      },
      destroy() {
        chartInstance.destroy();
      },
    };
  }

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

  /** @type {any[]} */
  let applications = [];
  /** @type {any[]} */
  let liveLogs = [];
  let isBotRunning = false;
  let isLoading = true;
  let error = "";

  // Set up Tauri IPC listening for live Bot output
  onMount(async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");

      const unlisten = await listen("bot-log", (event) => {
        isBotRunning = true;
        // The event.payload holds the string line from node.js
        const logLine = event.payload;

        // Let's filter out some deep debug noise and only keep structured or important lines
        if (
          logLine.includes("[BOT_EVENT]") ||
          logLine.includes("==================") ||
          logLine.includes("▶️") ||
          logLine.includes("✅") ||
          logLine.includes("❌") ||
          logLine.includes("⏳") ||
          logLine.includes("🚀") ||
          logLine.includes("🎉")
        ) {
          // Parse JSON if it's a structured bot event
          let structuredData = null;
          let displayMsg = logLine;

          if (logLine.includes("[BOT_EVENT]")) {
            try {
              const jsonStr = logLine.split("[BOT_EVENT]")[1].trim();
              structuredData = JSON.parse(jsonStr);

              if (structuredData.event === "start") {
                displayMsg = `🚀 Initializing workflow for Job ID: ${structuredData.jobId}`;
              } else if (structuredData.event === "error") {
                displayMsg = `❌ Workflow failed: ${structuredData.error}`;
              } else {
                displayMsg = `ℹ️ ${structuredData.event}`;
              }
            } catch (e) {
              // Fallback if parsing fails
              console.warn("Failed to parse BOT_EVENT", e);
            }
          }

          liveLogs = [
            ...liveLogs,
            {
              id: Date.now() + Math.random(),
              message: displayMsg,
              raw: logLine,
              time: new Date(),
            },
          ];
        }
      });

      return () => {
        unlisten();
      };
    } catch (e) {
      console.error(
        "Not running in Tauri / Fast-refresh failed IPC connection.",
      );
    }
  });

  function getLocalTodayDateString() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
  }

  const todayStr = getLocalTodayDateString();

  // Jobs Tab Filters
  let jobsPlatformFilter = "";
  let jobsFromDate = undefined;
  let jobsToDate = undefined;
  let jobsSearchQuery = "";
  let jobsCurrentPage = 1;
  let jobsItemsPerPage = 10;

  // Applied Tab Filters
  let appliedPlatformFilter = "";
  let appliedStatusFilter = "";
  let appliedSearchQuery = "";
  let appliedFromDate = undefined;
  let appliedToDate = undefined;
  let appliedCurrentPage = 1;
  let appliedItemsPerPage = 10;

  // UI state
  let activeTab = "jobs";
  /** @type {string[]} */
  let selectedJobs = [];

  $: tabs = [
    {
      id: "jobs",
      label: "Jobs",
      icon: "🔍",
      count: applications.filter((a) => a.status === "scraped").length,
    },
    {
      id: "applied",
      label: "Applied",
      icon: "✅",
      count: applications.filter((a) => a.status !== "scraped").length,
    },
    { id: "logs", label: "Logs", icon: "📋", count: null },
    { id: "analytics", label: "Analytics", icon: "📊", count: null },
  ];

  // Derived filtered views
  $: scrapedJobs = applications.filter((a) => {
    if (a.status !== "scraped") return false;
    if (jobsPlatformFilter && a.platform !== jobsPlatformFilter) return false;
    if (jobsSearchQuery) {
      const q = jobsSearchQuery.toLowerCase();
      const match =
        a.title?.toLowerCase().includes(q) ||
        a.company?.toLowerCase().includes(q);
      if (!match) return false;
    }
    const dStr = a.firstSeenAt || a.lastUpdatedAt;
    if (dStr && (jobsFromDate || jobsToDate)) {
      const d = new Date(dStr);
      if (!isNaN(d.getTime())) {
        const localDateStr = new Date(
          d.getTime() - d.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .split("T")[0];
        if (jobsFromDate && localDateStr < jobsFromDate) return false;
        if (jobsToDate && localDateStr > jobsToDate) return false;
      }
    }
    return true;
  });

  $: paginatedJobs = scrapedJobs.slice(
    (jobsCurrentPage - 1) * jobsItemsPerPage,
    jobsCurrentPage * jobsItemsPerPage,
  );

  $: {
    // Reset jobs page when filters change
    const _ = jobsPlatformFilter + jobsFromDate + jobsToDate + jobsSearchQuery;
    jobsCurrentPage = 1;
  }

  $: appliedJobs = applications.filter((a) => {
    if (a.status === "scraped") return false;
    if (appliedStatusFilter && a.status !== appliedStatusFilter) return false;
    if (appliedPlatformFilter && a.platform !== appliedPlatformFilter)
      return false;
    if (appliedSearchQuery) {
      const q = appliedSearchQuery.toLowerCase();
      const match =
        a.title?.toLowerCase().includes(q) ||
        a.company?.toLowerCase().includes(q);
      if (!match) return false;
    }
    const dStr = a.application?.appliedAt || a.lastUpdatedAt;
    if (dStr && (appliedFromDate || appliedToDate)) {
      const d = new Date(dStr);
      if (!isNaN(d.getTime())) {
        const localDateStr = new Date(
          d.getTime() - d.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .split("T")[0];
        if (appliedFromDate && localDateStr < appliedFromDate) return false;
        if (appliedToDate && localDateStr > appliedToDate) return false;
      }
    }
    return true;
  });

  $: paginatedAppliedJobs = appliedJobs.slice(
    (appliedCurrentPage - 1) * appliedItemsPerPage,
    appliedCurrentPage * appliedItemsPerPage,
  );

  $: {
    // Reset applied page when filters change
    const _ =
      appliedPlatformFilter +
      appliedStatusFilter +
      appliedSearchQuery +
      appliedFromDate +
      appliedToDate;
    appliedCurrentPage = 1;
  }

  // Pagination Helper Array Generator
  function getPageNumbers(currentPage, totalItems, itemsPerPage) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages === 0) return [];

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    return Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i,
    );
  }

  // System Logs Synthesis
  $: systemLogs = applications
    .reduce((logs, app) => {
      if (app.firstSeenAt) {
        logs.push({
          id: `${app._id}-scraped`,
          type: "info",
          icon: "🔍",
          title: "Job Discovered",
          message: `Bot discovered ${app.title} at ${app.company} via ${app.platform}`,
          timestamp: new Date(app.firstSeenAt).getTime(),
          dateStr: app.firstSeenAt,
        });
      }
      if (app.status !== "scraped") {
        const isSuccess = ["interview", "offer"].includes(app.status);
        const isWarning = app.status === "rejected";
        logs.push({
          id: `${app._id}-${app.status}`,
          type: isSuccess ? "success" : isWarning ? "error" : "primary",
          icon: isSuccess ? "🎉" : isWarning ? "❌" : "✉️",
          title: `Application ${app.status.charAt(0).toUpperCase() + app.status.slice(1)}`,
          message: `Status updated to ${app.status} for ${app.title} at ${app.company}`,
          timestamp: new Date(
            app.application?.appliedAt || app.lastUpdatedAt,
          ).getTime(),
          dateStr: app.application?.appliedAt || app.lastUpdatedAt,
        });
      }
      return logs;
    }, [])
    .sort((a, b) => b.timestamp - a.timestamp);

  // Stats
  $: totalFound = scrapedJobs.length;
  $: totalApplied = appliedJobs.length;
  $: todayJobs = scrapedJobs.filter((j) =>
    isToday(j.firstSeenAt || j.lastUpdatedAt),
  ).length;

  // Analytics Chart Data
  const chartOptions = { responsive: true, maintainAspectRatio: false };

  $: chartAppliedApps = applications.filter(
    (a) =>
      a.status !== "scraped" && (a.application?.appliedAt || a.lastUpdatedAt),
  );

  $: dailyData = (() => {
    const counts = {};
    const today = new Date();
    const labels = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      labels.push(dateStr);
      counts[dateStr] = 0;
    }
    chartAppliedApps.forEach((a) => {
      const d = new Date(a.application?.appliedAt || a.lastUpdatedAt);
      const dateStr = d.toISOString().split("T")[0];
      if (counts[dateStr] !== undefined) counts[dateStr]++;
    });
    return {
      labels: labels.map((l) => l.slice(5)),
      datasets: [
        {
          label: "Daily Applications",
          data: labels.map((l) => counts[l]),
          backgroundColor: "rgba(56, 189, 248, 0.7)",
          borderColor: "rgba(56, 189, 248, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  })();

  $: weeklyData = (() => {
    const counts = {};
    const today = new Date();
    const labels = [];
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(startOfWeek);
      weekStart.setDate(startOfWeek.getDate() - i * 7);
      const dateStr = weekStart.toISOString().split("T")[0];
      labels.push(dateStr);
      counts[dateStr] = 0;
    }
    chartAppliedApps.forEach((a) => {
      const d = new Date(a.application?.appliedAt || a.lastUpdatedAt);
      const dStart = new Date(d);
      dStart.setDate(d.getDate() - d.getDay());
      dStart.setHours(0, 0, 0, 0);
      const dateStr = dStart.toISOString().split("T")[0];
      if (counts[dateStr] !== undefined) counts[dateStr]++;
    });
    return {
      labels: labels.map((l) => `Wk ${l.slice(5)}`),
      datasets: [
        {
          label: "Weekly Momentum",
          data: labels.map((l) => counts[l]),
          backgroundColor: "rgba(167, 139, 250, 0.2)",
          borderColor: "rgba(167, 139, 250, 1)",
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        },
      ],
    };
  })();

  $: monthlyData = (() => {
    const counts = {};
    const today = new Date();
    const labels = [];
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      labels.push(key);
      counts[key] = {
        label: `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
        count: 0,
      };
    }
    chartAppliedApps.forEach((a) => {
      const d = new Date(a.application?.appliedAt || a.lastUpdatedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (counts[key] !== undefined) counts[key].count++;
    });
    return {
      labels: labels.map((l) => counts[l].label),
      datasets: [
        {
          label: "Monthly Volume",
          data: labels.map((l) => counts[l].count),
          backgroundColor: "rgba(163, 230, 53, 0.7)",
          borderColor: "rgba(163, 230, 53, 1)",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  })();

  function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  }

  onMount(() => {
    const auth = get(authService);
    if (!auth || !auth.isLoggedIn) {
      goto("/login");
      return;
    }
    loadApplications();
  });

  async function loadApplications() {
    isLoading = true;
    error = "";
    try {
      const headers = await tokenService.getHeaders();
      // Fetch all applications unconditionally for frontend filtering
      const response = await fetch(`${API_BASE}/api/job-applications`, {
        headers,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        applications = data.data.map((job) => ({
          ...job,
          status: job.status || "pending",
        }));
      } else {
        applications = [];
      }
    } catch (e) {
      error = String(
        (e && typeof e === "object" && "message" in e ? e.message : e) ||
          "Failed to load applications",
      );
      applications = [];
    } finally {
      isLoading = false;
    }
  }

  function formatDate(d) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function appliedAt(app) {
    if (app.status === "scraped") {
      return formatDate(app.firstSeenAt ?? app.lastUpdatedAt);
    }
    const t = app.application?.appliedAt ?? app.lastUpdatedAt;
    return formatDate(t);
  }

  async function triggerBotApply(app) {
    if (!app.url || !app.platform) {
      alert("This job is missing a URL or platform to run the bot.");
      return;
    }

    try {
      if (!selectedResumeFile) {
        await loadResumeOptions();
      }
      if (!selectedResumeFile) {
        alert("Please select a resume first from Auto-Apply modal.");
        return;
      }
      await persistSelectedResumeForBotRun();
      const mappedBotName = app.platform === "seek" ? "seek_apply" : app.platform;
      alert(
        `Triggering Bot Apply for ${app.platform} job: ${app.title} via direct job URL... Watch the Tauri console!`,
      );
      const response = await invoke("run_bot_for_job", {
        botName: mappedBotName,
        jobUrl: app.url,
      });
      console.log("Bot trigger response:", response);
    } catch (e) {
      console.error("Failed to trigger bot:", e);
      alert("Failed to trigger bot: " + e);
    }
  }

  function toggleJobSelection(jobId) {
    if (selectedJobs.includes(jobId)) {
      selectedJobs = selectedJobs.filter((id) => id !== jobId);
    } else {
      selectedJobs = [...selectedJobs, jobId];
    }
  }

  /**
   * @param {Event & { currentTarget: EventTarget & HTMLInputElement }} e
   */
  function toggleAllVisible(e) {
    const checked = e.currentTarget.checked;
    if (checked) {
      // Add all currently visible paginated jobs to selection, avoiding duplicates
      const visibleIds = paginatedJobs.map((j) => j._id);
      const newSelection = new Set([...selectedJobs, ...visibleIds]);
      selectedJobs = Array.from(newSelection);
    } else {
      // Remove all currently visible paginated jobs from selection
      const visibleIds = paginatedJobs.map((j) => j._id);
      selectedJobs = selectedJobs.filter((id) => !visibleIds.includes(id));
    }
  }

  $: allVisibleSelected =
    paginatedJobs.length > 0 &&
    paginatedJobs.every((j) => selectedJobs.includes(j._id));

  async function deleteSelectedJobs() {
    if (
      !confirm(
        `Are you sure you want to delete ${selectedJobs.length} selected job(s)?`,
      )
    )
      return;

    isLoading = true;
    try {
      const headers = await tokenService.getHeaders();
      const response = await fetch(`${API_BASE}/api/job-applications/bulk`, {
        method: "DELETE",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jobIds: selectedJobs }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete jobs");
      }

      const data = await response.json();
      if (data.success) {
        // Remove locally from UI
        applications = applications.filter(
          (a) => !selectedJobs.includes(a._id),
        );
        selectedJobs = [];
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      error = String(e);
      alert("Error deleting jobs: " + e);
    } finally {
      isLoading = false;
    }
  }

  // Modal State
  let showBotOverlay = false;
  let selectedBotMode = "review"; // "manual" | "review" | "bot"
  let isSuperbotActive = false;
  let availableResumeFiles = [];
  let selectedResumeFile = "";

  async function loadResumeOptions() {
    try {
      const configContent = await invoke("read_file_async", {
        filename: "src/bots/user-bots-config.json",
      });
      const parsed = JSON.parse(configContent || "{}");
      const userEmail = String(parsed?.formData?.email || "").trim();
      const configuredResume = String(parsed?.formData?.resumeFileName || "").trim();
      if (!userEmail) {
        availableResumeFiles = configuredResume ? [configuredResume] : [];
        selectedResumeFile = configuredResume;
        return;
      }

      const entries = await getManagedFiles({
        userId: userEmail,
        feature: "resume",
      });
      const files = entries
        .map((entry) => entry.filename)
        .filter((name) => typeof name === "string" && /\.(pdf|doc|docx)$/i.test(name));

      availableResumeFiles = files;
      if (configuredResume && files.includes(configuredResume)) {
        selectedResumeFile = configuredResume;
      } else {
        selectedResumeFile = files[0] || configuredResume || "";
      }
    } catch (e) {
      console.warn("Failed to load resume options for bulk apply:", e);
      availableResumeFiles = [];
      selectedResumeFile = "";
    }
  }

  async function persistSelectedResumeForBotRun() {
    if (!selectedResumeFile) return;
    const configContent = await invoke("read_file_async", {
      filename: "src/bots/user-bots-config.json",
    });
    const parsed = JSON.parse(configContent || "{}");
    const nextConfig = {
      ...(parsed || {}),
      formData: {
        ...((parsed && parsed.formData) || {}),
        resumeFileName: selectedResumeFile,
      },
    };
    await invoke("write_file_async", {
      filename: "src/bots/user-bots-config.json",
      content: JSON.stringify(nextConfig, null, 2),
    });
  }

  function bulkApply() {
    if (selectedJobs.length === 0) {
      alert("Please select at least one job first.");
      return;
    }
    // Just show the configuration overlay
    loadResumeOptions();
    showBotOverlay = true;
  }

  async function executeBulkQueue() {
    showBotOverlay = false;
    const jobIdsStr = selectedJobs;

    try {
      if (jobIdsStr.length === 0) {
        alert("Please select at least one job.");
        return;
      }
      if (!selectedResumeFile) {
        alert("Please select a resume before starting bot apply.");
        return;
      }
      const selectedJobRecords = applications.filter((a) =>
        jobIdsStr.includes(a._id),
      );
      const missingUrl = selectedJobRecords.filter((j) => !j.url);
      if (missingUrl.length > 0) {
        alert(
          `Some selected jobs are missing direct URLs (${missingUrl.length}). Please deselect them.`,
        );
        return;
      }
      await persistSelectedResumeForBotRun();
      console.log(`Dispatching ${jobIdsStr.length} jobs to queue...`);
      const response = await invoke("run_bot_bulk", {
        jobIds: jobIdsStr,
        mode: selectedBotMode,
        superbot: isSuperbotActive,
      });
      console.log("Bulk Bot trigger response:", response);
      alert(`Successfully dispatched ${jobIdsStr.length} jobs to the engine.`);
      selectedJobs = []; // clear the selection
    } catch (e) {
      console.error("Failed to trigger bulk bot:", e);
      alert("Failed to trigger bulk bot orchestration: " + e);
    }
  }
</script>

<svelte:head>
  <title>Job Analytics – Quest Bot</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header & Tabs -->
    <div class="flex justify-between items-center mb-8 flex-wrap gap-4">
      <h1 class="text-4xl font-bold text-primary">🔍 Job Tracker</h1>

      <div class="tabs tabs-boxed bg-base-100 shadow-sm">
        {#each tabs as tab}
          <button
            class="tab"
            class:tab-active={activeTab === tab.id}
            on:click={() => (activeTab = tab.id)}
          >
            <span class="mr-2">{tab.icon}</span>
            {tab.label}
            {#if tab.count !== null}
              <span
                class="badge badge-sm ml-2 {activeTab === tab.id
                  ? 'badge-primary'
                  : 'badge-ghost'}">{tab.count}</span
              >
            {/if}
          </button>
        {/each}
      </div>

      <div class="dropdown dropdown-end">
        <button class="btn btn-ghost" tabindex="0">
          <span>⋮</span>
        </button>
        <ul
          class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-50"
        >
          <li><a href="#export">📤 Export Data</a></li>
          <li>
            <a href="#refresh" on:click|preventDefault={loadApplications}
              >🔄 Refresh All</a
            >
          </li>
        </ul>
      </div>
    </div>

    <!-- Global API Errors -->
    {#if error}
      <div class="alert alert-error mb-6 shadow-sm">
        <span>{error}</span>
        <button type="button" class="btn btn-sm" on:click={loadApplications}
          >Retry</button
        >
      </div>
    {/if}

    <!-- Tab Content -->
    {#if isLoading}
      <div class="flex justify-center py-20">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
    {:else}
      <!-- JOBS TAB (Scraped) -->
      {#if activeTab === "jobs"}
        <div class="jobs-tab animate-fade-in">
          <!-- Search & Filter Bar -->
          <div class="flex gap-4 mb-8 flex-wrap">
            <div class="form-control flex-1 min-w-[250px]">
              <label class="label" for="search-jobs-input">
                <span class="label-text font-semibold">Search Jobs</span>
              </label>
              <input
                id="search-jobs-input"
                type="text"
                placeholder="Search by title, company..."
                bind:value={jobsSearchQuery}
                class="input input-bordered w-full bg-base-100 shadow-sm"
              />
            </div>

            <div class="form-control">
              <label class="label" for="filter-platform"
                ><span class="label-text font-semibold">Platform</span></label
              >
              <select
                id="filter-platform"
                class="select select-bordered bg-base-100 shadow-sm w-32"
                bind:value={jobsPlatformFilter}
              >
                <option value="">All</option>
                <option value="seek">Seek</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="filter-from"
                ><span class="label-text font-semibold">From Date</span></label
              >
              <input
                id="filter-from"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={jobsFromDate}
              />
            </div>

            <div class="form-control">
              <label class="label" for="filter-to"
                ><span class="label-text font-semibold">To Date</span></label
              >
              <input
                id="filter-to"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={jobsToDate}
              />
            </div>

            <div class="form-control">
              <div class="label">
                <span class="label-text font-semibold">&nbsp;</span>
              </div>
              <button
                class="btn btn-ghost shadow-sm"
                on:click={() => {
                  jobsSearchQuery = "";
                  jobsPlatformFilter = "";
                  jobsFromDate = undefined;
                  jobsToDate = undefined;
                }}>Clear filters</button
              >
            </div>
          </div>

          <!-- Jobs Table -->
          <div class="card bg-base-100 shadow-xl mb-4">
            <div class="card-body p-0">
              {#if scrapedJobs.length === 0}
                <div class="py-12 text-center text-base-content/60">
                  <p>No jobs found.</p>
                </div>
              {:else}
                <!-- Pagination Controls for Jobs (TOP) -->
                <div
                  class="flex justify-between items-center bg-base-100 p-4 rounded-t-xl border-b border-base-200"
                >
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-base-content/70"
                        >Rows per page:</span
                      >
                      <select
                        class="select select-bordered select-sm w-20"
                        bind:value={jobsItemsPerPage}
                        on:change={() => (jobsCurrentPage = 1)}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    {#if selectedJobs.length > 0}
                      <div
                        class="flex items-center gap-3 pl-4 border-l border-base-300 animate-fade-in"
                      >
                        <span class="text-sm font-bold text-primary"
                          >{selectedJobs.length} Selected</span
                        >
                        <div class="flex gap-2">
                          <button
                            class="btn btn-primary btn-sm shadow-sm"
                            on:click={bulkApply}
                          >
                            ✉️ Auto-Apply
                          </button>
                          <button
                            class="btn btn-error btn-outline btn-sm shadow-sm"
                            on:click={() => (selectedJobs = [])}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    {/if}
                  </div>

                  <div class="flex items-center gap-4">
                    <div class="text-sm text-base-content/70 hidden lg:block">
                      {(jobsCurrentPage - 1) * jobsItemsPerPage + 1}-
                      {Math.min(
                        jobsCurrentPage * jobsItemsPerPage,
                        scrapedJobs.length,
                      )}
                      of
                      {scrapedJobs.length}
                    </div>

                    <div class="join">
                      <button
                        class="join-item btn btn-sm"
                        disabled={jobsCurrentPage === 1}
                        on:click={() => jobsCurrentPage--}
                      >
                        «
                      </button>
                      {#each getPageNumbers(jobsCurrentPage, scrapedJobs.length, jobsItemsPerPage) as p}
                        <button
                          class="join-item btn btn-sm {jobsCurrentPage === p
                            ? 'btn-primary'
                            : ''}"
                          on:click={() => (jobsCurrentPage = p)}
                        >
                          {p}
                        </button>
                      {/each}
                      <button
                        class="join-item btn btn-sm"
                        disabled={jobsCurrentPage * jobsItemsPerPage >=
                          scrapedJobs.length}
                        on:click={() => jobsCurrentPage++}
                      >
                        »
                      </button>
                    </div>
                  </div>
                </div>

                <div class="overflow-x-auto">
                  <table class="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th class="w-12"
                          ><input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            checked={allVisibleSelected}
                            on:change={toggleAllVisible}
                          /></th
                        >
                        <th>Job Details</th>
                        <th>Location</th>
                        <th>Salary</th>
                        <th>Type</th>
                        <th>Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each paginatedJobs as job}
                        <tr class="hover">
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedJobs.includes(job._id)}
                              on:change={() => toggleJobSelection(job._id)}
                              class="checkbox checkbox-sm"
                            />
                          </td>
                          <td>
                            <div class="font-bold text-primary">
                              {job.title || "—"}
                            </div>
                            <div class="text-sm text-base-content/70">
                              {job.company || "—"}
                              <span class="badge badge-ghost badge-sm ml-2"
                                >{job.platform || "—"}</span
                              >
                            </div>
                            <div class="flex gap-1 flex-wrap mt-2">
                              {#if job.jobType}
                                <span
                                  class="badge badge-accent badge-outline badge-sm text-xs"
                                  >{job.jobType}</span
                                >
                              {/if}
                              {#if job.workMode}
                                <span
                                  class="badge badge-secondary badge-outline badge-sm text-xs"
                                  >{job.workMode}</span
                                >
                              {/if}
                            </div>
                          </td>
                          <td
                            ><div class="text-sm">
                              {job.location || "—"}
                            </div></td
                          >
                          <td
                            ><div
                              class="font-semibold text-sm max-w-[150px] truncate"
                              title={job.salary}
                            >
                              {job.salary || "—"}
                            </div></td
                          >
                          <td>
                            {#if job.applicationType === "internal"}
                              <span
                                class="badge badge-sm badge-success badge-outline text-xs tooltip"
                                data-tip="Quick Apply available">Internal</span
                              >
                            {:else if job.applicationType === "external"}
                              <span
                                class="badge badge-sm badge-warning badge-outline text-xs tooltip"
                                data-tip="Requires external site">External</span
                              >
                            {:else}
                              <span class="text-base-content/50 text-xs">—</span
                              >
                            {/if}
                          </td>
                          <td>
                            <div class="text-sm whitespace-nowrap">
                              {appliedAt(job)}
                            </div>
                          </td>
                          <td>
                            <div class="flex items-center gap-2">
                              <button
                                class="btn btn-primary btn-sm"
                                on:click={() => triggerBotApply(job)}
                                >Bot Apply</button
                              >
                              <div class="dropdown dropdown-end">
                                <button
                                  class="btn btn-ghost btn-sm"
                                  tabindex="0">⋮</button
                                >
                                <ul
                                  class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-40 z-50"
                                >
                                  <li>
                                    <a href="/job-analytics/{job._id}"
                                      >👁️ View Details</a
                                    >
                                  </li>
                                  {#if job.url}<li>
                                      <a href={job.url} target="_blank"
                                        >🔗 Open Link</a
                                      >
                                    </li>{/if}
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          </div>

          <!-- Pagination Controls for Jobs (BOTTOM) -->
          {#if scrapedJobs.length > 0}
            <div
              class="flex justify-between items-center bg-base-100 p-4 rounded-b-xl shadow-xl mt[-1rem] mb-8 relative z-10 border-t border-base-200"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-base-content/70">Rows per page:</span>
                <select
                  class="select select-bordered select-sm w-20"
                  bind:value={jobsItemsPerPage}
                  on:change={() => (jobsCurrentPage = 1)}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div class="text-sm text-base-content/70 hidden sm:block">
                {(jobsCurrentPage - 1) * jobsItemsPerPage + 1}-
                {Math.min(
                  jobsCurrentPage * jobsItemsPerPage,
                  scrapedJobs.length,
                )}
                of
                {scrapedJobs.length}
              </div>

              <div class="join">
                <button
                  class="join-item btn btn-sm"
                  disabled={jobsCurrentPage === 1}
                  on:click={() => jobsCurrentPage--}
                >
                  «
                </button>
                {#each getPageNumbers(jobsCurrentPage, scrapedJobs.length, jobsItemsPerPage) as p}
                  <button
                    class="join-item btn btn-sm {jobsCurrentPage === p
                      ? 'btn-primary'
                      : ''}"
                    on:click={() => (jobsCurrentPage = p)}
                  >
                    {p}
                  </button>
                {/each}
                <button
                  class="join-item btn btn-sm"
                  disabled={jobsCurrentPage * jobsItemsPerPage >=
                    scrapedJobs.length}
                  on:click={() => jobsCurrentPage++}
                >
                  »
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- APPLIED TAB (History) -->
      {:else if activeTab === "applied"}
        <div class="applied-tab animate-fade-in">
          <div class="flex justify-between items-center mb-4 flex-wrap gap-4">
            <h3 class="text-2xl font-bold text-primary">Application History</h3>
          </div>

          <div class="flex gap-4 mb-8 flex-wrap">
            <div class="form-control flex-1 min-w-[200px]">
              <label class="label" for="search-applied-input">
                <span class="label-text text-sm font-semibold"
                  >Search Applications</span
                >
              </label>
              <input
                id="search-applied-input"
                type="text"
                placeholder="Search by title, company..."
                bind:value={appliedSearchQuery}
                class="input input-bordered w-full bg-base-100 shadow-sm"
              />
            </div>

            <div class="form-control">
              <label class="label" for="applied-filter-status"
                ><span class="label-text text-sm font-semibold">Status</span
                ></label
              >
              <select
                id="applied-filter-status"
                bind:value={appliedStatusFilter}
                class="select select-bordered bg-base-100 shadow-sm w-32"
              >
                <option value="">All Statuses</option>
                <option value="applied">Applied</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="applied-filter-platform"
                ><span class="label-text text-sm font-semibold">Platform</span
                ></label
              >
              <select
                id="applied-filter-platform"
                bind:value={appliedPlatformFilter}
                class="select select-bordered bg-base-100 shadow-sm w-32"
              >
                <option value="">All</option>
                <option value="seek">Seek</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>

            <div class="form-control">
              <label class="label" for="applied-filter-from"
                ><span class="label-text text-sm font-semibold">From Date</span
                ></label
              >
              <input
                id="applied-filter-from"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={appliedFromDate}
              />
            </div>

            <div class="form-control">
              <label class="label" for="applied-filter-to"
                ><span class="label-text text-sm font-semibold">To Date</span
                ></label
              >
              <input
                id="applied-filter-to"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={appliedToDate}
              />
            </div>

            <div class="form-control">
              <div class="label">
                <span class="label-text text-sm font-semibold">&nbsp;</span>
              </div>
              <button
                class="btn btn-ghost shadow-sm"
                on:click={() => {
                  appliedSearchQuery = "";
                  appliedPlatformFilter = "";
                  appliedStatusFilter = "";
                  appliedFromDate = undefined;
                  appliedToDate = undefined;
                }}>Clear</button
              >
            </div>
          </div>

          <div class="stats shadow-sm mb-8 w-full bg-base-100">
            <div class="stat">
              <div class="stat-title">Total Applied</div>
              <div class="stat-value text-primary">{totalApplied}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Interviews</div>
              <div class="stat-value text-warning">
                {appliedJobs.filter((j) => j.status === "interview").length}
              </div>
            </div>
            <div class="stat">
              <div class="stat-title">Offers</div>
              <div class="stat-value text-success">
                {appliedJobs.filter((j) => j.status === "offer").length}
              </div>
            </div>
          </div>
          {#if appliedJobs.length === 0}
            <div class="card bg-base-100 shadow-xl mb-4">
              <div class="card-body py-12 text-center text-base-content/60">
                <p>No applications found matching your criteria.</p>
              </div>
            </div>
          {:else}
            <!-- Pagination Controls for Applied (TOP) -->
            <div
              class="flex justify-between items-center bg-base-100 p-4 rounded-t-xl border-b border-base-200"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-base-content/70">Rows per page:</span>
                <select
                  class="select select-bordered select-sm w-20"
                  bind:value={appliedItemsPerPage}
                  on:change={() => (appliedCurrentPage = 1)}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div class="text-sm text-base-content/70 hidden sm:block">
                {(appliedCurrentPage - 1) * appliedItemsPerPage + 1}-
                {Math.min(
                  appliedCurrentPage * appliedItemsPerPage,
                  appliedJobs.length,
                )}
                of
                {appliedJobs.length}
              </div>

              <div class="join">
                <button
                  class="join-item btn btn-sm"
                  disabled={appliedCurrentPage === 1}
                  on:click={() => appliedCurrentPage--}
                >
                  «
                </button>
                {#each getPageNumbers(appliedCurrentPage, appliedJobs.length, appliedItemsPerPage) as p}
                  <button
                    class="join-item btn btn-sm {appliedCurrentPage === p
                      ? 'btn-primary'
                      : ''}"
                    on:click={() => (appliedCurrentPage = p)}
                  >
                    {p}
                  </button>
                {/each}
                <button
                  class="join-item btn btn-sm"
                  disabled={appliedCurrentPage * appliedItemsPerPage >=
                    appliedJobs.length}
                  on:click={() => appliedCurrentPage++}
                >
                  »
                </button>
              </div>
            </div>

            <div class="card bg-base-100 shadow-xl mb-4 rounded-t-none">
              <div class="card-body p-0">
                <div class="overflow-x-auto">
                  <table class="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Job & Company</th>
                        <th>Location</th>
                        <th>Applied Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each paginatedAppliedJobs as application}
                        <tr class="hover">
                          <td>
                            <div class="font-bold text-primary">
                              {application.title || "—"}
                            </div>
                            <div class="text-sm text-base-content/70">
                              {application.company || "—"}
                              <span class="badge badge-ghost badge-sm"
                                >{application.platform}</span
                              >
                            </div>
                          </td>
                          <td>
                            <div class="text-sm text-base-content/80">
                              {application.location || "—"}
                            </div>
                          </td>
                          <td>
                            <div class="text-sm whitespace-nowrap">
                              {appliedAt(application)}
                            </div>
                          </td>
                          <td>
                            {#if application.status === "applied"}
                              <span class="badge badge-info badge-sm"
                                >Applied</span
                              >
                            {:else if application.status === "interview"}
                              <span class="badge badge-warning badge-sm"
                                >Interview</span
                              >
                            {:else if application.status === "offer"}
                              <span class="badge badge-success badge-sm"
                                >Offer</span
                              >
                            {:else if application.status === "rejected"}
                              <span class="badge badge-error badge-sm"
                                >Rejected</span
                              >
                            {:else}
                              <span class="badge badge-ghost badge-sm"
                                >{application.status}</span
                              >
                            {/if}
                          </td>
                          <td>
                            <a
                              href="/job-analytics/{application._id}"
                              class="btn btn-ghost btn-sm">👁️ View Details</a
                            >
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Pagination Controls for Applied (BOTTOM) -->
            {#if appliedJobs.length > 0}
              <div
                class="flex justify-between items-center bg-base-100 p-4 rounded-b-xl shadow-xl mt[-1rem] mb-8 relative z-10 border-t border-base-200"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm text-base-content/70"
                    >Rows per page:</span
                  >
                  <select
                    class="select select-bordered select-sm w-20"
                    bind:value={appliedItemsPerPage}
                    on:change={() => (appliedCurrentPage = 1)}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div class="text-sm text-base-content/70 hidden sm:block">
                  {(appliedCurrentPage - 1) * appliedItemsPerPage + 1}-
                  {Math.min(
                    appliedCurrentPage * appliedItemsPerPage,
                    appliedJobs.length,
                  )}
                  of
                  {appliedJobs.length}
                </div>

                <div class="join">
                  <button
                    class="join-item btn btn-sm"
                    disabled={appliedCurrentPage === 1}
                    on:click={() => appliedCurrentPage--}
                  >
                    «
                  </button>
                  {#each getPageNumbers(appliedCurrentPage, appliedJobs.length, appliedItemsPerPage) as p}
                    <button
                      class="join-item btn btn-sm {appliedCurrentPage === p
                        ? 'btn-primary'
                        : ''}"
                      on:click={() => (appliedCurrentPage = p)}
                    >
                      {p}
                    </button>
                  {/each}
                  <button
                    class="join-item btn btn-sm"
                    disabled={appliedCurrentPage * appliedItemsPerPage >=
                      appliedJobs.length}
                    on:click={() => appliedCurrentPage++}
                  >
                    »
                  </button>
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <!-- LOGS TAB (Activity Timeline) -->
      {:else if activeTab === "logs"}
        <div class="logs-tab animate-fade-in max-w-4xl mx-auto py-8">
          <div
            class="flex justify-between items-center mb-8 px-4 flex-wrap gap-4"
          >
            <h3 class="text-2xl font-bold text-primary">Activity Timeline</h3>
            <div class="badge badge-primary badge-outline">
              {systemLogs.length} Events
            </div>
          </div>

          {#if systemLogs.length === 0}
            <div class="text-center py-20 text-base-content/50">
              <div class="text-6xl mb-4 opacity-50">📭</div>
              <p>
                No activity logs found yet. Start the bot to see events here!
              </p>
            </div>
          {:else}
            <div class="relative px-4">
              <!-- Vertical Line -->
              <div
                class="absolute left-10 top-0 bottom-0 w-0.5 bg-base-300"
              ></div>

              <div class="flex flex-col gap-6">
                {#each systemLogs.slice(0, 50) as log (log.id)}
                  <div class="flex gap-6 items-start relative">
                    <!-- Icon Sphere -->
                    <div
                      class="w-12 h-12 rounded-full bg-base-100 border-2 border-base-300 shadow-sm flex items-center justify-center text-xl z-10 shrink-0"
                    >
                      {log.icon}
                    </div>

                    <!-- Content Card -->
                    <div
                      class="card bg-base-100 shadow-sm border border-base-200 flex-1 hover:shadow-md transition-shadow"
                    >
                      <div class="card-body p-4">
                        <div
                          class="flex justify-between items-start flex-wrap gap-2"
                        >
                          <h4 class={`font-bold text-${log.type}`}>
                            {log.title}
                          </h4>
                          <span
                            class="text-xs font-mono text-base-content/60 bg-base-200 px-2 py-1 rounded-md"
                          >
                            {formatDate(log.dateStr)}
                          </span>
                        </div>
                        <p class="text-sm text-base-content/80 mt-1">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>

              {#if systemLogs.length > 50}
                <div class="text-center mt-8 text-sm text-base-content/50">
                  Showing latest 50 events.
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- ANALYTICS TAB -->
      {:else if activeTab === "analytics"}
        <div class="analytics-tab animate-fade-in max-w-6xl mx-auto py-8">
          <div
            class="flex justify-between items-center mb-8 px-4 flex-wrap gap-4"
          >
            <h3 class="text-2xl font-bold text-primary">
              Performance Dashboard
            </h3>
          </div>

          <!-- Time Saved Widget -->
          <div
            class="stats shadow-xl mb-12 w-full bg-gradient-to-br from-primary/10 to-base-100 border border-primary/20"
          >
            <div class="stat">
              <div class="stat-figure text-primary">
                <span class="text-4xl">🤖</span>
              </div>
              <div class="stat-title font-bold text-base-content/80">
                Total Bot Output
              </div>
              <div class="stat-value text-primary">{totalApplied} Jobs</div>
              <div class="stat-desc font-semibold mt-1 text-base-content/70">
                Successfully Applied
              </div>
            </div>

            <div class="stat">
              <div class="stat-figure text-secondary">
                <span class="text-4xl">⏱️</span>
              </div>
              <div class="stat-title font-bold text-base-content/80">
                Estimated Time Saved
              </div>
              <div class="stat-value text-secondary">
                {((totalApplied * 5) / 60).toFixed(1)} Hours
              </div>
              <div class="stat-desc font-semibold mt-1 text-base-content/70">
                Based on 5 mins per manual app
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <!-- Daily Chart -->
            <div class="card bg-base-100 shadow-sm border border-base-200">
              <div class="card-body">
                <h2 class="card-title text-base-content/80">
                  Daily Hustle (Last 14 Days)
                </h2>
                <div class="h-[300px] w-full mt-4 relative">
                  <canvas
                    use:chartAction={{
                      type: "bar",
                      data: dailyData,
                      options: chartOptions,
                    }}
                  ></canvas>
                </div>
              </div>
            </div>

            <!-- Weekly Chart -->
            <div class="card bg-base-100 shadow-sm border border-base-200">
              <div class="card-body">
                <h2 class="card-title text-base-content/80">
                  Weekly Momentum (Last 8 Weeks)
                </h2>
                <div class="h-[300px] w-full mt-4 relative">
                  <canvas
                    use:chartAction={{
                      type: "line",
                      data: weeklyData,
                      options: chartOptions,
                    }}
                  ></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- Monthly Chart -->
          <div class="card bg-base-100 shadow-sm border border-base-200 w-full">
            <div class="card-body">
              <h2 class="card-title text-base-content/80">
                Monthly Volume (Last 6 Months)
              </h2>
              <div class="h-[300px] w-full mt-4 relative">
                <canvas
                  use:chartAction={{
                    type: "bar",
                    data: monthlyData,
                    options: chartOptions,
                  }}
                ></canvas>
              </div>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- Bot Orchestration Modal overlay -->
{#if showBotOverlay}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <h3 class="font-bold text-xl mb-4">🚀 Launch Application Queue</h3>
      <p class="py-2 text-base text-base-content/70 mb-6">
        You are about to queue <strong>{selectedJobs.length} job(s)</strong> for
        asynchronous application. Choose your preferred execution mode below.
      </p>

      <div class="form-control mb-4">
        <label class="label" for="bulk-resume-select">
          <span class="label-text font-bold">Resume to use for apply</span>
        </label>
        {#if availableResumeFiles.length > 0}
          <select
            id="bulk-resume-select"
            class="select select-bordered"
            bind:value={selectedResumeFile}
          >
            {#each availableResumeFiles as resumeName}
              <option value={resumeName}>{resumeName}</option>
            {/each}
          </select>
        {:else}
          <div class="text-sm text-warning">
            No resume found. Upload/select resume from Configuration page first.
          </div>
        {/if}
      </div>

      <div class="form-control mb-4">
        <label class="label cursor-pointer justify-start gap-4">
          <input
            type="radio"
            name="bot-mode"
            class="radio radio-primary"
            value="manual"
            bind:group={selectedBotMode}
            disabled={isSuperbotActive}
          />
          <div class="flex-1">
            <span class="label-text font-bold text-base">Manual Mode</span>
            <div class="text-sm text-base-content/60 mt-1">
              Bot opens the application but stops immediately for human entry.
            </div>
          </div>
        </label>
      </div>

      <div class="form-control mb-4">
        <label class="label cursor-pointer justify-start gap-4">
          <input
            type="radio"
            name="bot-mode"
            class="radio radio-primary"
            value="review"
            bind:group={selectedBotMode}
            disabled={isSuperbotActive}
          />
          <div class="flex-1">
            <span class="label-text font-bold text-base"
              >Review Mode (Recommended)</span
            >
            <div class="text-sm text-base-content/60 mt-1">
              Bot fills everything and generates docs, but halts for final human
              submit approval.
            </div>
          </div>
        </label>
      </div>

      <div class="form-control mb-4">
        <label class="label cursor-pointer justify-start gap-4">
          <input
            type="radio"
            name="bot-mode"
            class="radio radio-primary"
            value="bot"
            bind:group={selectedBotMode}
            disabled={isSuperbotActive}
          />
          <div class="flex-1">
            <span class="label-text font-bold text-warning">Full Bot Mode</span>
            <div class="text-sm text-base-content/60 mt-1">
              Bot autonomously fires application. No human intervention unless
              crashed.
            </div>
          </div>
        </label>
      </div>

      <div class="divider my-4"></div>

      <div
        class="form-control bg-base-200 p-5 rounded-xl border border-warning/30 mb-4"
      >
        <label class="label cursor-pointer justify-between">
          <div class="flex-1">
            <span
              class="label-text font-bold text-warning flex items-center gap-2 text-base"
            >
              ⚠️ Superbot Override
            </span>
            <div class="text-sm text-base-content/60 mt-2">
              Force all jobs globally into Full Bot Mode, overriding any
              individual pauses.
            </div>
          </div>
          <input
            type="checkbox"
            class="toggle toggle-warning ml-4"
            bind:checked={isSuperbotActive}
          />
        </label>
      </div>

      <div class="modal-action mt-6">
        <button class="btn btn-ghost" on:click={() => (showBotOverlay = false)}
          >Cancel</button
        >
        <button
          class="btn btn-primary"
          disabled={!selectedResumeFile}
          on:click={executeBulkQueue}
          >Execute Queue</button
        >
      </div>
    </div>
    <form
      method="dialog"
      class="modal-backdrop"
      on:click={() => (showBotOverlay = false)}
    >
      <button>close</button>
    </form>
  </dialog>
{/if}

<!-- Live Execution Toast Overlay -->
{#if isBotRunning && liveLogs.length > 0}
  <div class="toast toast-end toast-bottom z-50 animate-fade-in-up w-96">
    <div
      class="alert alert-info bg-base-100 shadow-xl border border-primary/30 flex flex-col items-start gap-2 max-h-96 overflow-y-auto w-full text-sm"
    >
      <div
        class="flex justify-between w-full items-center border-b border-base-300 pb-2 mb-1 sticky top-0 bg-base-100/95 backdrop-blur z-10"
      >
        <span class="font-bold text-primary">🤖 Bot Execution Sequence</span>
        <button
          class="btn btn-ghost btn-xs text-base-content/50 hover:text-error"
          on:click={() => {
            liveLogs = [];
            isBotRunning = false;
          }}
        >
          ✕ Close
        </button>
      </div>

      <div class="flex flex-col w-full gap-2">
        {#each liveLogs as log (log.id)}
          <div
            class="font-mono text-xs flex gap-2 animate-fade-in {log.message.includes(
              '❌',
            )
              ? 'text-error'
              : log.message.includes('✅')
                ? 'text-success'
                : 'text-base-content'}"
          >
            <span class="opacity-50 min-w-16"
              >[{new Date(log.time).toLocaleTimeString([], {
                hourCycle: "h23",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}]</span
            >
            <span class="break-words w-full">{log.message}</span>
          </div>
        {/each}
      </div>

      <div class="w-full mt-2 pt-2 border-t border-base-300">
        <button
          class="btn btn-outline btn-xs w-full"
          on:click={() => (liveLogs = [])}>Clear Buffer</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .animate-fade-in {
    animation: fadeIn 0.3s ease-in-out;
  }
  .animate-fade-in-up {
    animation: fadeInUp 0.4s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
