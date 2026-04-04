<script>
  import { onMount } from "svelte";
  import flatpickr from "flatpickr";
  import "flatpickr/dist/flatpickr.min.css";
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

  // Register Chart.js components once per component instance
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

  // If `platform` is provided, tracker is platform-specific.
  // If omitted/undefined, tracker operates in "overview" mode across all platforms.
  export let platform; // "linkedin" | "seek" | "indeed" | undefined
  // `bots` is accepted for backward compatibility but not used here;
  // bots are configured and launched from the Choose Bot screen instead.
  export let bots = []; // e.g. ["linkedin_extract_bot", "linkedin_apply_bot"]
  // Mark as used to avoid Svelte's unused-export warning when routes pass it.
  $: bots;

  const PLATFORM_LABELS = {
    linkedin: "LinkedIn",
    seek: "Seek",
    indeed: "Indeed",
  };

  $: trackerLabel = platform ? (PLATFORM_LABELS[platform] || platform) : "All Platforms";

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

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

  /** @type {any[]} */
  let applications = [];
  let isLoading = true;
  let error = "";
  let refreshDebounceTimer;

  // Sorting
  let sortColumn = "date";
  let sortDirection = "desc";

  function toggleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === "desc" ? "asc" : "desc";
    } else {
      sortColumn = column;
      sortDirection = "desc";
    }
  }

  let appliedSortOrder = "newest";

  let fpInstance;
  function datepickerAction(node) {
    fpInstance = flatpickr(node, {
      mode: "range",
      dateFormat: "Y-m-d",
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
          const offset = selectedDates[0].getTimezoneOffset() * 60000;
          jobsFromDate = new Date(selectedDates[0].getTime() - offset).toISOString().split("T")[0];
          jobsToDate = new Date(selectedDates[1].getTime() - offset).toISOString().split("T")[0];
        } else if (selectedDates.length === 0) {
          jobsFromDate = undefined;
          jobsToDate = undefined;
        }
      }
    });

    return {
      destroy() {
        if (fpInstance) fpInstance.destroy();
      }
    };
  }

  function scheduleApplicationsRefresh(delayMs = 1200) {
    if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = setTimeout(() => {
      loadApplications();
    }, delayMs);
  }

  // Set up Tauri IPC listening for live Bot output
  onMount(async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");

      const unlisten = await listen("bot-log", (event) => {
        const logLine = event.payload;

        if (
          logLine.includes(
            "Application recorded successfully with status 'applied'",
          ) ||
          logLine.includes("JobRecorder] API call successful!")
        ) {
          scheduleApplicationsRefresh();
        }
      });

      return () => {
        unlisten();
        if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
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
  let platformFilter = "";
  let jobsFromDate = undefined;
  let jobsToDate = undefined;
  let jobsSearchQuery = "";
  let jobsCurrentPage = 1;
  let jobsItemsPerPage = 10;

  // Applied Tab Filters
  let appliedStatusFilter = "";
  let appliedPlatformFilter = "";
  let appliedSearchQuery = "";
  let appliedFromDate = undefined;
  let appliedToDate = undefined;
  let appliedCurrentPage = 1;
  let appliedItemsPerPage = 10;

  // UI state
  let activeTab = "jobs";
  /** @type {string[]} */
  let selectedJobs = [];

  // Column Visibility State
  let columns = [
    { id: "details", label: "Job Details", visible: true, disableToggle: true },
    { id: "location", label: "Location", visible: true },
    { id: "workplace_type", label: "Workplace Type", visible: false },
    { id: "salary", label: "Salary", visible: true },
    { id: "type", label: "Type", visible: true },
    { id: "date", label: "Date", visible: true },
    { id: "status", label: "Status", visible: true },
    { id: "actions", label: "Actions", visible: true, disableToggle: true }
  ];

  // Derived filtered views
  $: scrapedJobs = (() => {
    const list = applications.filter((a) => {
      // Show all jobs (removed the status filter so applied jobs show too)
      if (platform) {
        if (a.platform !== platform) return false;
      } else if (platformFilter && a.platform !== platformFilter) {
        return false;
      }
      if (jobsSearchQuery) {
        const q = jobsSearchQuery.toLowerCase();
        const match =
          a.title?.toLowerCase().includes(q) ||
          a.company?.toLowerCase().includes(q);
        if (!match) return false;
      }
      const dStr = a.status === "scraped"
        ? (a.firstSeenAt || a.lastUpdatedAt)
        : (a.application?.appliedAt || a.lastUpdatedAt);
        
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

    list.sort((a, b) => {
      let result = 0;
      if (sortColumn === "salary") {
        const sa = a.salary || "";
        const sb = b.salary || "";
        result = sa.localeCompare(sb, undefined, { numeric: true });
      } else if (sortColumn === "type") {
        const ta = a.applicationType || "";
        const tb = b.applicationType || "";
        result = ta.localeCompare(tb);
      } else if (sortColumn === "status") {
        const sa = a.status || "";
        const sb = b.status || "";
        result = sa.localeCompare(sb);
      } else if (sortColumn === "workplace_type") {
        const wa = getWorkplaceType(a.location);
        const wb = getWorkplaceType(b.location);
        result = wa.localeCompare(wb);
      } else {
        const timeA = a.status === "scraped"
          ? new Date(a.firstSeenAt ?? a.lastUpdatedAt ?? 0).getTime()
          : new Date(a.application?.appliedAt ?? a.lastUpdatedAt ?? 0).getTime();
        const timeB = b.status === "scraped"
          ? new Date(b.firstSeenAt ?? b.lastUpdatedAt ?? 0).getTime()
          : new Date(b.application?.appliedAt ?? b.lastUpdatedAt ?? 0).getTime();
        result = timeA - timeB;
      }
      return sortDirection === "desc" ? -result : result;
    });

    return list;
  })();

  $: paginatedJobs = scrapedJobs.slice(
    (jobsCurrentPage - 1) * jobsItemsPerPage,
    jobsCurrentPage * jobsItemsPerPage,
  );

  $: {
    const _ = jobsFromDate + jobsToDate + jobsSearchQuery + sortColumn + sortDirection;
    jobsCurrentPage = 1;
  }

  $: appliedJobs = (() => {
    const list = applications.filter((a) => {
      if (a.status === "scraped") return false;
      if (platform) {
        if (a.platform !== platform) return false;
      } else if (appliedPlatformFilter && a.platform !== appliedPlatformFilter) {
        return false;
      }
      if (appliedStatusFilter && a.status !== appliedStatusFilter) return false;
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

    list.sort((a, b) => {
      const da = new Date(
        a.application?.appliedAt ?? a.lastUpdatedAt ?? 0,
      ).getTime();
      const db = new Date(
        b.application?.appliedAt ?? b.lastUpdatedAt ?? 0,
      ).getTime();
      return appliedSortOrder === "newest" ? db - da : da - db;
    });

    return list;
  })();

  $: paginatedAppliedJobs = appliedJobs.slice(
    (appliedCurrentPage - 1) * appliedItemsPerPage,
    appliedCurrentPage * appliedItemsPerPage,
  );

  $: {
    const _ =
      appliedStatusFilter +
      appliedSearchQuery +
      appliedFromDate +
      appliedToDate +
      appliedSortOrder;
    appliedCurrentPage = 1;
  }

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
    .filter((job) => {
      if (platform) {
        return job.platform === platform;
      }
      if (platformFilter || appliedPlatformFilter) {
        const pf = platformFilter || appliedPlatformFilter;
        return job.platform === pf;
      }
      return true;
    })
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
          title: `Application ${
            app.status.charAt(0).toUpperCase() + app.status.slice(1)
          }`,
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

  // Stats (platform-scoped)
  $: totalFound = scrapedJobs.length;
  $: totalApplied = appliedJobs.length;
  $: todayJobs = scrapedJobs.filter((j) =>
    isToday(j.firstSeenAt || j.lastUpdatedAt),
  ).length;

  const chartOptions = { responsive: true, maintainAspectRatio: false };

  $: chartAppliedApps = applications.filter((a) => {
    if (a.status === "scraped") return false;
    if (platform) {
      if (a.platform !== platform) return false;
    } else if (appliedPlatformFilter && a.platform !== appliedPlatformFilter) {
      return false;
    }
    return !!(a.application?.appliedAt || a.lastUpdatedAt);
  });

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
        label: `${monthNames[d.getMonth()]} ${d
          .getFullYear()
          .toString()
          .slice(2)}`,
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
      const url = platform
        ? `${API_BASE}/api/jobs/${platform}`
        : `${API_BASE}/api/job-applications`;
      const response = await fetch(url, {
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
          status: String(job.status || "pending").toLowerCase(),
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

  function parseDateTime(d) {
    if (!d) return null;
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return null;
    return {
      dateStr: date.toLocaleDateString(undefined, { dateStyle: "medium" }),
      timeStr: date.toLocaleTimeString(undefined, { timeStyle: "short" })
    };
  }

  function getJobDateTime(app) {
    if (app.status === "scraped") {
      return parseDateTime(app.firstSeenAt ?? app.lastUpdatedAt);
    }
    return parseDateTime(app.application?.appliedAt ?? app.lastUpdatedAt);
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
      const mappedBotName =
        app.platform === "seek"
          ? "seek_apply"
          : app.platform === "linkedin"
            ? "linkedin_apply"
            : app.platform;
      const response = await invoke("run_bot_for_job", {
        botName: mappedBotName,
        jobUrl: app.url,
        jobId: app.platformJobId,
        mode: selectedBotMode,
        keepOpen: selectedBotMode !== "bot",
      });
      console.log("Bot trigger response:", response);
    } catch (e) {
      console.error("Failed to trigger bot:", e);
      alert("Failed to trigger bot: " + e);
    }
  }

  let showSelectionWarning = false;

  function toggleJobSelection(jobId) {
    if (selectedJobs.includes(jobId)) {
      selectedJobs = selectedJobs.filter((id) => id !== jobId);
      if (selectedJobs.length < 10) showSelectionWarning = false;
    } else {
      if (selectedJobs.length >= 10) {
        showSelectionWarning = true;
        setTimeout(() => (showSelectionWarning = false), 5000);
        return;
      }
      selectedJobs = [...selectedJobs, jobId];
    }
  }

  function getWorkplaceType(job) {
    if (!job) return "—";
    
    // Check structured data fields first
    const type = job.workMode || job.work_type || job.workType || job.jobType || "";
    const t = type.toLowerCase();
    if (t.includes("remote")) return "Remote";
    if (t.includes("hybrid")) return "Hybrid";
    if (t.includes("on-site") || t.includes("onsite")) return "On-site";

    const loc = String(job.location || "").toLowerCase();
    if (loc.includes("remote")) return "Remote";
    if (loc.includes("hybrid")) return "Hybrid";
    if (loc.includes("on-site") || loc.includes("onsite")) return "On-site";
    
    return "—";
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
      const configuredResume = String(
        parsed?.formData?.resumeFileName || "",
      ).trim();
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
      selectedJobs = [];
    } catch (e) {
      console.error("Failed to trigger bulk bot:", e);
      alert("Failed to trigger bulk bot orchestration: " + e);
    }
  }
</script>

<svelte:head>
  <title>
    {trackerLabel}
  </title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header & Bot Access Panel -->
    <div class="flex flex-col gap-4 mb-6">
      <div class="flex justify-between items-center flex-wrap gap-4">
        <h1 class="text-4xl font-bold text-primary mb-4">
          🔍 {trackerLabel}
        </h1>

        <div class="dropdown dropdown-end">
          <button class="btn btn-ghost" tabindex="0">
            <span>⋮</span>
          </button>
          <ul
            class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-50"
          >
            <li>
              <a href="#export">📤 Export Data</a>
            </li>
            <li>
              <a href="#refresh" on:click|preventDefault={loadApplications}
                >🔄 Refresh</a
              >
            </li>
          </ul>
        </div>
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

    {#if showSelectionWarning}
      <div class="toast toast-end toast-bottom z-[100] animate-bounce">
        <div class="alert alert-error shadow-lg text-white font-semibold">
          <span>⚠️ For your own safety, let's not apply to more than 10 jobs at a time.</span>
        </div>
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
          <div class="flex items-center gap-4 mb-8 flex-wrap">
            <div class="form-control flex-1 min-w-[250px]">
              <input
                id="search-jobs-input"
                type="text"
                placeholder="Search jobs by title, company..."
                bind:value={jobsSearchQuery}
                class="input input-bordered w-full bg-base-100 shadow-sm"
              />
            </div>

            {#if !platform}
              <div class="form-control">
                <select
                  id="jobs-platform-filter"
                  class="select select-bordered bg-base-100 shadow-sm w-32"
                  bind:value={platformFilter}
                >
                  <option value="">All</option>
                  <option value="seek">Seek</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                </select>
              </div>
            {/if}

            <div class="form-control">
              <div class="relative">
                <input class="hidden" use:datepickerAction />
                <button
                  class="btn btn-ghost btn-circle bg-base-100 shadow-sm border border-base-300"
                  on:click={() => fpInstance?.open()}
                  title="Filter by Date Range"
                  aria-label="Filter by Date Range"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-base-content/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </button>
              </div>
            </div>

            <div class="form-control">
              <div class="dropdown dropdown-end">
                <div tabindex="0" role="button" class="btn btn-ghost btn-circle bg-base-100 shadow-sm border border-base-300" title="Columns" aria-label="Columns">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-base-content/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </div>
                <ul tabindex="-1" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-52 mt-1">
                  {#each columns as col}
                    {#if !col.disableToggle}
                      <li>
                        <label class="label cursor-pointer justify-start gap-3">
                          <input type="checkbox" class="checkbox checkbox-sm" bind:checked={col.visible} />
                          <span class="label-text">{col.label}</span>
                        </label>
                      </li>
                    {/if}
                  {/each}
                </ul>
              </div>
            </div>
          </div>

          <!-- Jobs Table -->
          <div class="card bg-base-100 shadow-xl mb-4">
            <div class="card-body p-0">
              {#if scrapedJobs.length === 0}
                <div class="py-12 text-center text-base-content/60">
                  <p>No jobs found for this platform.</p>
                </div>
              {:else}
                {#if selectedJobs.length > 0}
                  <div class="flex items-center gap-3 animate-fade-in p-4 rounded-t-xl border-b border-base-200 bg-base-100">
                    <span class="text-sm font-bold text-primary">{selectedJobs.length} Selected</span>
                    <div class="flex gap-2">
                      <button class="btn btn-primary btn-sm shadow-sm" on:click={bulkApply}>✉️ Auto-Apply</button>
                      <button class="btn btn-error btn-outline btn-sm shadow-sm" on:click={() => (selectedJobs = [])}>Clear</button>
                    </div>
                  </div>
                {/if}

                <div class="overflow-x-auto">
                  <table class="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th class="w-12 pl-6">
                          <input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            checked={allVisibleSelected}
                            on:change={(e) => {
                              const checked = e.currentTarget.checked;
                              if (checked) {
                                const visibleIds = paginatedJobs.map((j) => j._id);
                                const newSelection = new Set([...selectedJobs]);
                                
                                for (const id of visibleIds) {
                                  if (newSelection.size < 10) {
                                    newSelection.add(id);
                                  } else {
                                    showSelectionWarning = true;
                                    setTimeout(() => showSelectionWarning = false, 5000);
                                    break;
                                  }
                                }
                                selectedJobs = Array.from(newSelection);
                              } else {
                                const visibleIds = paginatedJobs.map((j) => j._id);
                                selectedJobs = selectedJobs.filter(
                                  (id) => !visibleIds.includes(id),
                                );
                                showSelectionWarning = false;
                              }
                            }}
                          />
                        </th>
                        <th>Job Details</th>
                        {#if columns.find(c => c.id === 'location')?.visible}<th>Location</th>{/if}
                        {#if columns.find(c => c.id === 'workplace_type')?.visible}
                          <th class="cursor-pointer hover:bg-base-200" on:click={() => toggleSort('workplace_type')}>
                            Workplace Type {sortColumn === 'workplace_type' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                          </th>
                        {/if}
                        {#if columns.find(c => c.id === 'salary')?.visible}
                          <th class="cursor-pointer hover:bg-base-200" on:click={() => toggleSort('salary')}>
                            Salary {sortColumn === 'salary' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                          </th>
                        {/if}
                        {#if columns.find(c => c.id === 'type')?.visible}
                          <th class="cursor-pointer hover:bg-base-200" on:click={() => toggleSort('type')}>
                            Type {sortColumn === 'type' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                          </th>
                        {/if}
                        {#if columns.find(c => c.id === 'date')?.visible}
                          <th class="cursor-pointer hover:bg-base-200 text-center w-[160px] min-w-[160px]" on:click={() => toggleSort('date')}>
                            Date {sortColumn === 'date' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                          </th>
                        {/if}
                        {#if columns.find(c => c.id === 'status')?.visible}
                          <th class="cursor-pointer hover:bg-base-200 text-center w-[160px] min-w-[160px]" on:click={() => toggleSort('status')}>
                            Status {sortColumn === 'status' ? (sortDirection === 'desc' ? '▼' : '▲') : ''}
                          </th>
                        {/if}
                        <th class="text-center w-[130px] min-w-[130px]">Actions</th>
                        <th class="w-[60px] min-w-[60px] pr-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each paginatedJobs as job}
                        <tr class="hover">
                          <td class="pl-6">
                            <input
                              type="checkbox"
                              checked={selectedJobs.includes(job._id)}
                              on:change={() => toggleJobSelection(job._id)}
                              class="checkbox checkbox-sm"
                            />
                          </td>
                          <td>
                            <div class="font-bold text-base text-primary">
                              {job.title || "—"}
                            </div>
                            <div class="text-sm text-base-content/60 mt-0.5">
                              {job.company || "—"}
                            </div>
                          </td>
                          {#if columns.find(c => c.id === 'location')?.visible}
                            <td>
                              <div class="text-sm">
                                {job.location || "—"}
                              </div>
                            </td>
                          {/if}
                          {#if columns.find(c => c.id === 'workplace_type')?.visible}
                            <td>
                              <div class="text-sm">
                                {getWorkplaceType(job)}
                              </div>
                            </td>
                          {/if}
                          {#if columns.find(c => c.id === 'salary')?.visible}
                            <td>
                              <div
                                class="font-semibold text-sm max-w-[150px] truncate"
                                title={job.salary}
                              >
                                {job.salary || "—"}
                              </div>
                            </td>
                          {/if}
                          {#if columns.find(c => c.id === 'type')?.visible}
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
                                <span class="text-base-content/50 text-xs">—</span>
                              {/if}
                            </td>
                          {/if}
                          {#if columns.find(c => c.id === 'date')?.visible}
                            {@const dt = getJobDateTime(job)}
                            <td class="text-center w-[160px] min-w-[160px]">
                              {#if dt}
                                <div class="flex flex-col items-center">
                                  <div class="text-xs text-error font-medium mb-0.5">{dt.timeStr}</div>
                                  <div class="text-sm whitespace-nowrap">{dt.dateStr}</div>
                                </div>
                              {:else}
                                <span class="text-sm text-base-content/50">—</span>
                              {/if}
                            </td>
                          {/if}
                          {#if columns.find(c => c.id === 'status')?.visible}
                            <td class="text-center w-[160px] min-w-[160px]">
                              {#if job.status === "applied"}
                                <span class="badge badge-info badge-sm">Applied</span>
                              {:else if job.status === "interview"}
                                <span class="badge badge-warning badge-sm">Interview</span>
                              {:else if job.status === "offer"}
                                <span class="badge badge-success badge-sm">Offer</span>
                              {:else if job.status === "rejected"}
                                <span class="badge badge-error badge-sm">Rejected</span>
                              {:else if job.status === "scraped"}
                                <span class="badge badge-ghost badge-sm text-base-content/60">Discovered</span>
                              {:else}
                                <span class="badge badge-ghost badge-sm">{job.status}</span>
                              {/if}
                            </td>
                          {/if}
                          <td class="text-center w-[130px] min-w-[130px]">
                            <div class="flex items-center justify-center">
                              {#if job.status !== 'applied'}
                                <button
                                  class="btn btn-primary btn-sm"
                                  on:click={() => triggerBotApply(job)}
                                >{job.applicationType === "external" ? "Apply" : "Bot Apply"}</button>
                              {/if}
                            </div>
                          </td>
                          <td class="w-[60px] min-w-[60px] text-center pr-6">
                              <div class="dropdown dropdown-end">
                                <button
                                  class="btn btn-ghost btn-sm px-2"
                                  aria-label="Job actions"
                                  tabindex="0">⋮</button
                                >
                                <ul
                                  class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-40 z-50"
                                >
                                  <li>
                                    <a href={`/jobs/${job._id}`}
                                      >👁️ View Details</a
                                    >
                                  </li>
                                  {#if job.url}
                                    <li>
                                      <a href={job.url} target="_blank"
                                        >🔗 Open Link</a
                                      >
                                    </li>
                                  {/if}
                                </ul>
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
                {#each getPageNumbers(
                  jobsCurrentPage,
                  scrapedJobs.length,
                  jobsItemsPerPage,
                ) as p}
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
            <h3 class="text-2xl font-bold text-primary">
              Application History{platform ? ` – ${trackerLabel}` : ""}
            </h3>
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
              <label class="label" for="applied-filter-status">
                <span class="label-text text-sm font-semibold">Status</span>
              </label>
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

            {#if !platform}
              <div class="form-control">
                <label class="label" for="applied-platform-filter">
                  <span class="label-text text-sm font-semibold">Platform</span>
                </label>
                <select
                  id="applied-platform-filter"
                  bind:value={appliedPlatformFilter}
                  class="select select-bordered bg-base-100 shadow-sm w-32"
                >
                  <option value="">All</option>
                  <option value="seek">Seek</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                </select>
              </div>
            {/if}

            <div class="form-control">
              <label class="label" for="applied-filter-from">
                <span class="label-text text-sm font-semibold">From Date</span>
              </label>
              <input
                id="applied-filter-from"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={appliedFromDate}
              />
            </div>

            <div class="form-control">
              <label class="label" for="applied-filter-to">
                <span class="label-text text-sm font-semibold">To Date</span>
              </label>
              <input
                id="applied-filter-to"
                type="date"
                class="input input-bordered bg-base-100 shadow-sm"
                bind:value={appliedToDate}
              />
            </div>

            <div class="form-control">
              <label class="label" for="applied-sort-order">
                <span class="label-text text-sm font-semibold">Sort</span>
              </label>
              <select
                id="applied-sort-order"
                bind:value={appliedSortOrder}
                class="select select-bordered bg-base-100 shadow-sm w-40"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            <div class="form-control">
              <div class="label">
                <span class="label-text text-sm font-semibold">&nbsp;</span>
              </div>
              <button
                class="btn btn-ghost shadow-sm"
                on:click={() => {
                  appliedSearchQuery = "";
                  appliedStatusFilter = "";
                  appliedFromDate = undefined;
                  appliedToDate = undefined;
                  appliedSortOrder = "newest";
                  if (!platform) appliedPlatformFilter = "";
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
                {#each getPageNumbers(
                  appliedCurrentPage,
                  appliedJobs.length,
                  appliedItemsPerPage,
                ) as p}
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
                              href={`/jobs/${application._id}`}
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
                  {#each getPageNumbers(
                    appliedCurrentPage,
                    appliedJobs.length,
                    appliedItemsPerPage,
                  ) as p}
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
            <h3 class="text-2xl font-bold text-primary">
              Activity Timeline{platform ? ` – ${trackerLabel}` : ""}
            </h3>
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
              <div
                class="absolute left-10 top-0 bottom-0 w-0.5 bg-base-300"
              ></div>

              <div class="flex flex-col gap-6">
                {#each systemLogs.slice(0, 50) as log (log.id)}
                  <div class="flex gap-6 items-start relative">
                    <div
                      class="w-12 h-12 rounded-full bg-base-100 border-2 border-base-300 shadow-sm flex items-center justify-center text-xl z-10 shrink-0"
                    >
                      {log.icon}
                    </div>

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
              Performance Dashboard{platform ? ` – ${trackerLabel}` : ""}
            </h3>
          </div>

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
    <form method="dialog" class="modal-backdrop">
      <button type="button" on:click={() => (showBotOverlay = false)}>
        close
      </button>
    </form>
  </dialog>
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

