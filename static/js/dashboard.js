/**
 * Meetly - Dashboard & Core App Module (static/js/dashboard.js)
 * Handles App Routing (Hash & Sidebar Switcher), Dashboard KPI Metrics,
 * Weekly Activity Chart, Recent Activity Timeline, Theme Accent Colors,
 * Settings & Preferences, and Global Bootstrapping.
 */

window.Meetly = window.Meetly || {};

// Global Utility Functions
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

window.escapeHtml = escapeHtml;
window.escapeRegex = escapeRegex;
window.delay = delay;
window.Meetly.escapeHtml = escapeHtml;
window.Meetly.escapeRegex = escapeRegex;
window.Meetly.delay = delay;

document.addEventListener("DOMContentLoaded", () => {
    // Supabase Session & Logout Handler
    const logoutLink = document.getElementById("logoutLink");
    if (logoutLink) {
        logoutLink.addEventListener("click", async (e) => {
            e.preventDefault();
            if (window.MeetlyAuth) {
                await window.MeetlyAuth.signOut();
            } else {
                window.location.href = "/logout";
            }
        });
    }

    // Keep persistent Supabase session verified and in sync
    if (window.MeetlyAuth) {
        window.MeetlyAuth.getSession().then(session => {
            if (session) {
                window.MeetlyAuth.syncSessionToBackend(session);
            }
        }).catch(() => {});
    }

    function _getActivityKey() {
        const email = (window._currentUserEmail || "guest@meetly.app").trim().toLowerCase();
        return `meetly_activity_log_${email}`;
    }

    const MOCK_ACTIVITY_IDS = ["act-1", "act-2", "act-3"];
    const MOCK_ACTIVITY_SUBTITLES = ["Project Discussion", "Team Meeting", "Complete frontend"];

    function getStoredActivities() {
        try {
            const raw = localStorage.getItem(_getActivityKey());
            if (raw !== null) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.filter(a => !MOCK_ACTIVITY_IDS.includes(a.id) && !MOCK_ACTIVITY_SUBTITLES.includes(a.subtitle));
                }
            }
            return [];
        } catch (e) {
            return [];
        }
    }

    function saveStoredActivities(activities) {
        try {
            const clean = (activities || []).filter(a => !MOCK_ACTIVITY_IDS.includes(a.id) && !MOCK_ACTIVITY_SUBTITLES.includes(a.subtitle));
            localStorage.setItem(_getActivityKey(), JSON.stringify(clean));
        } catch (e) {}
    }

    function formatTimeAgo(timestamp, fallback) {
        if (!timestamp) {
            return (fallback && fallback !== "Just now") ? fallback : "Earlier";
        }
        const tsMs = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
        if (!Number.isFinite(tsMs)) {
            return (fallback && fallback !== "Just now") ? fallback : "Earlier";
        }
        const diffSec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
        if (diffSec < 60) return "Just now";
        const mins = Math.floor(diffSec / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    }

    function addActivityLog(title, subtitle, timeStr = "Just now", color = "blue") {
        const activities = getStoredActivities();
        const newAct = {
            id: "act-" + Date.now(),
            title: title,
            subtitle: subtitle,
            time: timeStr,
            timestamp: Date.now(),
            color: color
        };
        activities.unshift(newAct);
        if (activities.length > 12) activities.pop();
        saveStoredActivities(activities);
        renderRecentActivity();
    }

    function renderRecentActivity() {
        const container = document.getElementById("recentActivityList");
        if (!container) return;
        const activities = getStoredActivities();
        container.innerHTML = "";

        if (activities.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">No recent activity</p>`;
            return;
        }

        const colorMap = {
            emerald: "text-emerald-500",
            blue: "text-pink-500",
            indigo: "text-indigo-500",
            amber: "text-amber-500",
            rose: "text-rose-500",
            purple: "text-purple-500"
        };

        activities.slice(0, 5).forEach(act => {
            const item = document.createElement("div");
            item.className = "flex items-start gap-3 text-xs leading-relaxed group";
            const dotClass = colorMap[act.color] || "text-pink-500";

            item.innerHTML = `
                <span class="${dotClass} text-base leading-none font-bold shrink-0 mt-0.5 select-none">&bull;</span>
                <div class="min-w-0 flex-1">
                    <p class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(act.title)}</p>
                    <p class="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-1 min-w-0">
                        <span class="truncate">${escapeHtml(act.subtitle)}</span>
                        <span class="shrink-0">&middot; ${escapeHtml(formatTimeAgo(act.timestamp, act.time))}</span>
                    </p>
                </div>
            `;
            container.appendChild(item);
        });
    }



    function _getMeetingsKey() {
        const email = (window._currentUserEmail || "guest@meetly.app").trim().toLowerCase();
        return `meetly_cached_meetings_${email}`;
    }

    const MOCK_TITLES = ["Project Discussion", "Team Meeting", "Client Discussion"];
    const MOCK_IDS = ["m-1", "m-2", "m-3"];

    function getStoredMeetings() {
        if (typeof window.getStoredMeetings === "function" && window.getStoredMeetings !== getStoredMeetings) {
            try {
                const list = window.getStoredMeetings();
                if (Array.isArray(list)) return list.filter(m => !MOCK_IDS.includes(m.id) && !MOCK_TITLES.includes(m.title));
            } catch (e) {}
        }
        try {
            const raw = localStorage.getItem(_getMeetingsKey());
            if (raw !== null) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed.filter(m => !MOCK_IDS.includes(m.id) && !MOCK_TITLES.includes(m.title));
                }
            }
        } catch (e) {}
        return [];
    }

    function renderDashboardMetrics() {
        const meetings = getStoredMeetings();
        const emptyState = document.getElementById("dashboardEmptyState");
        const populatedState = document.getElementById("dashboardPopulatedState");

        if (!meetings || meetings.length === 0) {
            if (emptyState) emptyState.classList.remove("hidden");
            if (populatedState) populatedState.classList.add("hidden");
            renderRecentActivity();
            return;
        }

        if (emptyState) emptyState.classList.add("hidden");
        if (populatedState) populatedState.classList.remove("hidden");

        // 1. KPI Calculations directly from actual meetings data
        const totalMeetings = meetings.length;

        let totalDurationMins = 0;
        let totalActions = 0;
        let openActions = 0;
        let completedActions = 0;
        let pendingActions = 0;
        let totalDecisions = 0;

        meetings.forEach(m => {
            totalDurationMins += (m.durationMinutes || 0);
            const bd = m.actionsBreakdown || {};
            const open = bd.open || 0;
            const comp = bd.completed || 0;
            const pend = bd.pending || 0;
            const sumFromBd = open + comp + pend;
            const count = m.actionsCount || sumFromBd;

            totalActions += count;
            if (sumFromBd > 0) {
                openActions += open;
                completedActions += comp;
                pendingActions += pend;
            } else {
                openActions += count;
            }
            totalDecisions += (m.decisionsCount || 0);
        });

        const hours = Math.floor(totalDurationMins / 60);
        const mins = totalDurationMins % 60;
        const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const metricMeetingsCount = document.getElementById("metricMeetingsCount");
        if (metricMeetingsCount) metricMeetingsCount.textContent = totalMeetings;

        const nowMs = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const thisWeekCount = meetings.filter(m => {
            if (m.created_at) {
                const ts = Date.parse(m.created_at);
                if (Number.isFinite(ts)) return (nowMs - ts) <= sevenDaysMs;
            }
            return m.category === "today" || m.category === "week";
        }).length;

        const metricMeetingsTrend = document.getElementById("metricMeetingsTrend");
        if (metricMeetingsTrend) metricMeetingsTrend.textContent = `${thisWeekCount} this week`;

        const metricDurationVal = document.getElementById("metricDurationVal");
        if (metricDurationVal) metricDurationVal.textContent = durationStr;

        const avgMins = totalMeetings > 0 ? Math.round(totalDurationMins / totalMeetings) : 0;
        const metricDurationTrend = document.getElementById("metricDurationTrend");
        if (metricDurationTrend) metricDurationTrend.textContent = `Avg ${avgMins}m`;

        const metricActionsCount = document.getElementById("metricActionsCount");
        if (metricActionsCount) metricActionsCount.textContent = totalActions;

        const metricActionsOpen = document.getElementById("metricActionsOpen");
        if (metricActionsOpen) metricActionsOpen.textContent = `${Math.max(0, totalActions - completedActions)} open`;

        const metricDecisionsCount = document.getElementById("metricDecisionsCount");
        if (metricDecisionsCount) metricDecisionsCount.textContent = totalDecisions;

        // 2. Action Items Data Layer & Visualization
        function getActionItemsData() {
            return {
                open: openActions,
                completed: completedActions,
                pending: pendingActions,
                total: totalActions
            };
        }

        function renderActionItemsBreakdown(data) {
            const listContainer = document.getElementById("actionItemsListContainer");
            const emptyState = document.getElementById("actionItemsEmptyState");
            const skeleton = document.getElementById("actionItemsSkeleton");
            const totalBadge = document.getElementById("actionTotalBadge");
            const compRateEl = document.getElementById("actionCompRate");

            if (skeleton) skeleton.classList.add("hidden");

            if (!data || data.total === 0) {
                if (listContainer) listContainer.classList.add("hidden");
                if (emptyState) emptyState.classList.remove("hidden");
                if (totalBadge) totalBadge.textContent = "0 Total";
                if (compRateEl) compRateEl.textContent = "0% completed";
                return;
            }

            if (emptyState) emptyState.classList.add("hidden");
            if (listContainer) listContainer.classList.remove("hidden");

            const total = data.total > 0 ? data.total : 1;
            const openPct = ((data.open / total) * 100).toFixed(1);
            const compPct = ((data.completed / total) * 100).toFixed(1);
            const pendPct = ((data.pending / total) * 100).toFixed(1);

            if (totalBadge) totalBadge.textContent = `${data.total} Total`;

            const openCountEl = document.getElementById("actionOpenCount");
            if (openCountEl) openCountEl.innerHTML = `${data.open} <span class="text-[10px] text-slate-400 font-sans font-normal">(${openPct}%)</span>`;
            const openBar = document.getElementById("actionOpenBar");
            if (openBar) openBar.style.width = `${openPct}%`;

            const compCountEl = document.getElementById("actionCompCount");
            if (compCountEl) compCountEl.innerHTML = `${data.completed} <span class="text-[10px] text-slate-400 font-sans font-normal">(${compPct}%)</span>`;
            const compBar = document.getElementById("actionCompBar");
            if (compBar) compBar.style.width = `${compPct}%`;

            const pendCountEl = document.getElementById("actionPendCount");
            if (pendCountEl) pendCountEl.innerHTML = `${data.pending} <span class="text-[10px] text-slate-400 font-sans font-normal">(${pendPct}%)</span>`;
            const pendBar = document.getElementById("actionPendBar");
            if (pendBar) pendBar.style.width = `${pendPct}%`;

            const openTipItems = document.getElementById("actionOpenTooltipItems");
            if (openTipItems) openTipItems.textContent = `${data.open} items`;
            const openTipPct = document.getElementById("actionOpenTooltipPct");
            if (openTipPct) openTipPct.textContent = `${openPct}%`;

            const compTipItems = document.getElementById("actionCompTooltipItems");
            if (compTipItems) compTipItems.textContent = `${data.completed} items`;
            const compTipPct = document.getElementById("actionCompTooltipPct");
            if (compTipPct) compTipPct.textContent = `${compPct}%`;

            const pendTipItems = document.getElementById("actionPendTooltipItems");
            if (pendTipItems) pendTipItems.textContent = `${data.pending} items`;
            const pendTipPct = document.getElementById("actionPendTooltipPct");
            if (pendTipPct) pendTipPct.textContent = `${pendPct}%`;

            if (compRateEl) {
                compRateEl.textContent = `${compPct}% completed`;
            }

            const metricActionsOpen = document.getElementById("metricActionsOpen");
            if (metricActionsOpen) metricActionsOpen.textContent = `${data.open} open`;
        }

        const actionItemsData = getActionItemsData();
        renderActionItemsBreakdown(actionItemsData);

        // 3. Meeting Activity Data Layer & Chart.js
        let currentActivityRange = "this_week";

        function getMeetingActivityDemoData(range = "this_week") {
            const counts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
            meetings.forEach(m => {
                if (m.dayOfWeek && counts[m.dayOfWeek] !== undefined) {
                    counts[m.dayOfWeek] += 1;
                }
            });
            const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
            const dayData = dayLabels.map(d => counts[d]);
            return {
                labels: dayLabels,
                data: dayData,
                totalMeetings: dayData.reduce((a, b) => a + b, 0)
            };
        }

        function hexToRgba(hex, alpha) {
            if (!hex) return `rgba(236, 72, 153, ${alpha})`;
            let c = hex.replace("#", "").trim();
            if (c.length === 3) {
                c = c.split("").map(x => x + x).join("");
            }
            const num = parseInt(c, 16);
            if (isNaN(num)) return `rgba(236, 72, 153, ${alpha})`;
            const r = (num >> 16) & 255;
            const g = (num >> 8) & 255;
            const b = num & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function renderSvgActivityFallback(activityData) {
            const wrapper = document.getElementById("activityChartCanvasWrapper");
            if (!wrapper) return;
            const isDark = document.documentElement.classList.contains("dark");
            const accentHex = getComputedStyle(document.documentElement).getPropertyValue("--theme-accent").trim() || "#ec4899";
            const data = (activityData && activityData.data) ? activityData.data : [0, 0, 0, 0, 0];
            const labels = (activityData && activityData.labels) ? activityData.labels : ["Mon", "Tue", "Wed", "Thu", "Fri"];
            const maxVal = Math.max(...data, 10);
            
            const n = labels.length;
            const coords = data.map((val, idx) => {
                const x = Math.round(45 + (idx / Math.max(n - 1, 1)) * 410);
                const y = Math.round(145 - (val / maxVal) * 115);
                return { x, y, label: labels[idx], val };
            });

            let lineD = `M ${coords[0].x} ${coords[0].y}`;
            for (let i = 0; i < coords.length - 1; i++) {
                const cp1x = (coords[i].x + coords[i + 1].x) / 2;
                const cp1y = coords[i].y;
                const cp2x = (coords[i].x + coords[i + 1].x) / 2;
                const cp2y = coords[i + 1].y;
                lineD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${coords[i + 1].x} ${coords[i + 1].y}`;
            }

            const areaD = `${lineD} L ${coords[coords.length - 1].x} 155 L ${coords[0].x} 155 Z`;
            const strokeColor = accentHex;
            const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
            const pointBorder = isDark ? "#0d121f" : "#ffffff";
            const textColor = isDark ? "#94a3b8" : "#64748b";

            wrapper.innerHTML = `
                <div class="relative w-full h-full flex flex-col justify-between select-none">
                    <svg class="w-full h-40 overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="svgFallbackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <line x1="20" y1="30" x2="480" y2="30" stroke="${gridColor}" stroke-dasharray="3 3" stroke-width="1" />
                        <line x1="20" y1="85" x2="480" y2="85" stroke="${gridColor}" stroke-dasharray="3 3" stroke-width="1" />
                        <line x1="20" y1="140" x2="480" y2="140" stroke="${gridColor}" stroke-dasharray="3 3" stroke-width="1" />
                        <path d="${areaD}" fill="url(#svgFallbackGrad)" />
                        <path d="${lineD}" fill="none" stroke="${strokeColor}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" />
                        ${coords.map(c => `
                            <g class="cursor-pointer group/pt" data-day="${c.label}" data-val="${c.val}">
                                <circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${strokeColor}" stroke="${pointBorder}" stroke-width="2" class="transition-transform duration-150 hover:scale-150 origin-center" style="transform-origin: ${c.x}px ${c.y}px">
                                    <title>${c.label}: ${c.val} meetings</title>
                                </circle>
                            </g>
                        `).join("")}
                    </svg>
                    <div class="flex justify-between px-6 pt-1 text-[11px] font-semibold" style="color: ${textColor}">
                        ${labels.map(l => `<span>${l}</span>`).join("")}
                    </div>
                </div>
            `;
        }

        let activityChartInstance = null;

        function renderMeetingActivityChart(activityData) {
            const wrapper = document.getElementById("activityChartCanvasWrapper");
            const skeleton = document.getElementById("activityChartSkeleton");
            const emptyState = document.getElementById("activityChartEmptyState");
            const errorState = document.getElementById("activityChartErrorState");

            if (!wrapper) return;

            if (skeleton) skeleton.classList.add("hidden");
            if (errorState) errorState.classList.add("hidden");

            if (!activityData || !activityData.data || activityData.data.length === 0 || activityData.totalMeetings === 0) {
                wrapper.classList.add("hidden");
                if (emptyState) emptyState.classList.remove("hidden");
                if (activityChartInstance) {
                    activityChartInstance.destroy();
                    activityChartInstance = null;
                }
                return;
            }

            if (emptyState) emptyState.classList.add("hidden");
            wrapper.classList.remove("hidden");

            // If Chart.js library is not loaded, use the SVG fallback immediately
            if (typeof Chart === "undefined") {
                renderSvgActivityFallback(activityData);
                return;
            }

            // Ensure canvas element exists inside wrapper
            let canvas = document.getElementById("meetingActivityCanvas");
            if (!canvas) {
                wrapper.innerHTML = '<canvas id="meetingActivityCanvas" style="display: block; width: 100%; height: 100%;"></canvas>';
                canvas = document.getElementById("meetingActivityCanvas");
            }

            const isDark = document.documentElement.classList.contains("dark");
            const accentHex = getComputedStyle(document.documentElement).getPropertyValue("--theme-accent").trim() || "#ec4899";

            const ctx = canvas.getContext("2d");
            const chartHeight = Math.max(canvas.clientHeight || 180, 180);
            const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
            gradient.addColorStop(0, hexToRgba(accentHex, 0.26));
            gradient.addColorStop(0.7, hexToRgba(accentHex, 0.05));
            gradient.addColorStop(1, hexToRgba(accentHex, 0.0));

            const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
            const labelColor = isDark ? "#94a3b8" : "#64748b";
            const pointBg = accentHex;
            const pointBorder = isDark ? "#0d121f" : "#ffffff";

            const maxVal = Math.max(...activityData.data, 5);
            const suggestedMax = Math.ceil((maxVal + 2) / 2) * 2;

            const chartConfig = {
                type: "line",
                data: {
                    labels: activityData.labels,
                    datasets: [{
                        label: "Meetings",
                        data: activityData.data,
                        borderColor: accentHex,
                        borderWidth: 2.75,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.38,
                        pointRadius: 4.5,
                        pointHoverRadius: 7.5,
                        pointBackgroundColor: pointBg,
                        pointBorderColor: pointBorder,
                        pointBorderWidth: 2,
                        pointHoverBackgroundColor: pointBg,
                        pointHoverBorderColor: pointBorder,
                        pointHoverBorderWidth: 2.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 400,
                        easing: "easeOutQuart"
                    },
                    interaction: {
                        mode: "index",
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(15, 23, 42, 0.95)",
                            titleColor: "#93c5fd",
                            titleFont: {
                                family: "Inter",
                                size: 12,
                                weight: "700"
                            },
                            bodyColor: "#ffffff",
                            bodyFont: {
                                family: "Inter",
                                size: 12,
                                weight: "500"
                            },
                            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                            borderWidth: 1,
                            cornerRadius: 10,
                            padding: {
                                top: 8,
                                bottom: 8,
                                left: 12,
                                right: 12
                            },
                            caretPadding: 6,
                            displayColors: false,
                            callbacks: {
                                title: function(context) {
                                    return context[0].label || "";
                                },
                                label: function(context) {
                                    const val = context.parsed.y;
                                    return `Meetings: ${val}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: labelColor,
                                font: {
                                    family: "Inter",
                                    size: 11,
                                    weight: "600"
                                }
                            },
                            border: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            suggestedMax: suggestedMax,
                            grid: {
                                color: gridColor,
                                strokeDash: [4, 4]
                            },
                            ticks: {
                                stepSize: 2,
                                color: labelColor,
                                font: {
                                    family: "Inter",
                                    size: 10
                                },
                                padding: 8
                            },
                            border: {
                                display: false
                            }
                        }
                    }
                }
            };

            if (activityChartInstance) {
                activityChartInstance.data.labels = chartConfig.data.labels;
                activityChartInstance.data.datasets[0].data = chartConfig.data.datasets[0].data;
                activityChartInstance.data.datasets[0].borderColor = chartConfig.data.datasets[0].borderColor;
                activityChartInstance.data.datasets[0].backgroundColor = chartConfig.data.datasets[0].backgroundColor;
                activityChartInstance.data.datasets[0].pointBackgroundColor = chartConfig.data.datasets[0].pointBackgroundColor;
                activityChartInstance.data.datasets[0].pointBorderColor = chartConfig.data.datasets[0].pointBorderColor;
                activityChartInstance.options.scales.x.ticks.color = chartConfig.options.scales.x.ticks.color;
                activityChartInstance.options.scales.y.ticks.color = chartConfig.options.scales.y.ticks.color;
                activityChartInstance.options.scales.y.grid.color = chartConfig.options.scales.y.grid.color;
                activityChartInstance.options.scales.y.suggestedMax = chartConfig.options.scales.y.suggestedMax;
                activityChartInstance.update();
            } else {
                const existingChart = typeof Chart.getChart === "function" ? Chart.getChart(canvas) : null;
                if (existingChart) existingChart.destroy();
                activityChartInstance = new Chart(ctx, chartConfig);
            }
        }

        window._refreshMeetingActivityChart = function() {
            const data = getMeetingActivityDemoData(currentActivityRange);
            renderMeetingActivityChart(data);
        };

        const initialActivityData = getMeetingActivityDemoData(currentActivityRange);
        renderMeetingActivityChart(initialActivityData);

        const activityRangeSelect = document.getElementById("meetingActivityRangeSelect");
        if (activityRangeSelect) {
            activityRangeSelect.addEventListener("change", (e) => {
                currentActivityRange = e.target.value;
                const skeleton = document.getElementById("activityChartSkeleton");
                const wrapper = document.getElementById("activityChartCanvasWrapper");
                if (skeleton && wrapper) {
                    skeleton.classList.remove("hidden");
                    wrapper.classList.add("hidden");
                    setTimeout(() => {
                        skeleton.classList.add("hidden");
                        wrapper.classList.remove("hidden");
                        window._refreshMeetingActivityChart();
                    }, 200);
                } else {
                    window._refreshMeetingActivityChart();
                }
            });
        }

        const activityChartRetryBtn = document.getElementById("activityChartRetryBtn");
        if (activityChartRetryBtn) {
            activityChartRetryBtn.addEventListener("click", () => {
                const skeleton = document.getElementById("activityChartSkeleton");
                const errorState = document.getElementById("activityChartErrorState");
                if (skeleton) skeleton.classList.remove("hidden");
                if (errorState) errorState.classList.add("hidden");
                setTimeout(() => {
                    if (skeleton) skeleton.classList.add("hidden");
                    window._refreshMeetingActivityChart();
                }, 300);
            });
        }

        // Reactive observer to re-color the chart when theme or accent updates
        if (!window._themeChartObserverInit) {
            window._themeChartObserverInit = true;
            const themeObserver = new MutationObserver(() => {
                if (window._refreshMeetingActivityChart) {
                    window._refreshMeetingActivityChart();
                }
            });
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-accent"] });
        }

        // 4. Dynamic Recent Meetings Render
        const recentMeetingsContainer = document.getElementById("recentMeetingsContainer");
        if (recentMeetingsContainer) {
            recentMeetingsContainer.innerHTML = "";
            if (!meetings || meetings.length === 0) {
                recentMeetingsContainer.innerHTML = `
                    <div class="py-10 text-center flex flex-col items-center justify-center">
                        <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 01-14 0m7 7v4m-4 0h8m-4-11a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"/></svg>
                        </div>
                        <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">No meetings recorded yet</p>
                        <p class="text-xs text-slate-400 mt-1">Upload an audio recording to see your minutes and action items here.</p>
                    </div>
                `;
            } else {
                const recentSlice = meetings.slice(0, 5);
                recentSlice.forEach((m, idx) => {
                    const palette = [
                        { bg: "bg-pink-50 dark:bg-pink-950/60", text: "text-pink-600 dark:text-pink-400", hover: "group-hover:text-pink-600 dark:group-hover:text-pink-400" },
                        { bg: "bg-purple-50 dark:bg-purple-950/60", text: "text-purple-600 dark:text-purple-400", hover: "group-hover:text-purple-600 dark:group-hover:text-purple-400" },
                        { bg: "bg-emerald-50 dark:bg-emerald-950/60", text: "text-emerald-600 dark:text-emerald-400", hover: "group-hover:text-emerald-600 dark:group-hover:text-emerald-400" }
                    ];
                    const theme = palette[idx % palette.length];

                    const row = document.createElement("div");
                    row.className = "recent-meeting-item py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-3 rounded-xl transition cursor-pointer group";
                    row.setAttribute("data-meeting-id", m.id);

                    row.innerHTML = `
                        <div class="flex items-center gap-3.5 min-w-0">
                            <div class="w-9 h-9 rounded-xl ${theme.bg} ${theme.text} flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-14 0m14 0a7 7 0 01-14 0m7 7v4m-4 0h8m-4-11a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"/></svg>
                            </div>
                            <div class="truncate">
                                <span class="text-sm font-bold text-slate-900 dark:text-white ${theme.hover} transition block truncate">${escapeHtml(m.title)}</span>
                                <span class="text-xs text-slate-400">${escapeHtml(m.description || "Meeting audio & summary")}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-6 sm:gap-12 shrink-0">
                            <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 font-mono">${escapeHtml(m.duration || "15m")}</span>
                            <span class="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg">${m.actionsCount || 0} actions</span>
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-pink-600 group-hover:bg-pink-50 dark:group-hover:bg-pink-950/50 group-hover:translate-x-0.5 transition">
                                <span class="font-bold text-base">&rarr;</span>
                            </div>
                        </div>
                    `;

                    row.addEventListener("click", () => {
                        if (m.demo_lang && typeof window.loadDemoMeeting === "function") {
                            window.loadDemoMeeting(m.demo_lang);
                        } else if (typeof window.openSavedMeeting === "function") {
                            window.openSavedMeeting(m);
                        }
                    });

                    recentMeetingsContainer.appendChild(row);
                });
            }
        }

        renderRecentActivity();
    }

    // Explore Demo Recordings Modal & Actions
    const demoRecordingsModal = document.getElementById("demoRecordingsModal");
    const closeDemoModalBtn = document.getElementById("closeDemoModalBtn");
    const dismissDemoModalBtn = document.getElementById("dismissDemoModalBtn");

    function openDemoRecordingsModal() {
        if (demoRecordingsModal) {
            demoRecordingsModal.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function closeDemoRecordingsModal() {
        if (demoRecordingsModal) {
            demoRecordingsModal.classList.add("hidden");
            document.body.style.overflow = "";
        }
    }

    if (closeDemoModalBtn) closeDemoModalBtn.addEventListener("click", closeDemoRecordingsModal);
    if (dismissDemoModalBtn) dismissDemoModalBtn.addEventListener("click", closeDemoRecordingsModal);
    if (demoRecordingsModal) {
        demoRecordingsModal.addEventListener("click", (e) => {
            if (e.target === demoRecordingsModal) closeDemoRecordingsModal();
        });
    }

    document.querySelectorAll(".select-demo-option").forEach(card => {
        card.addEventListener("click", () => {
            const lang = card.getAttribute("data-demo-lang") || "english";
            closeDemoRecordingsModal();
            loadDemoMeeting(lang);
        });
    });

    const loadDemoDataBtn = document.getElementById("loadDemoDataBtn");
    if (loadDemoDataBtn) {
        loadDemoDataBtn.addEventListener("click", () => {
            openDemoRecordingsModal();
        });
    }

    const dashboardDemoBtn = document.getElementById("dashboardDemoBtn");
    if (dashboardDemoBtn) {
        dashboardDemoBtn.addEventListener("click", () => {
            openDemoRecordingsModal();
        });
    }

    // Dynamic Accent Color Palette definition
    const ACCENT_COLORS = {
        'pink': {
            name: 'pink',
            main: '#ec4899',
            hover: '#db2777',
            light: '#fdf2f8',
            shadow: 'rgba(236, 72, 153, 0.28)',
            ring: 'rgba(236, 72, 153, 0.45)',
            canvas: '#fdf4f8',
            canvasDark: '#100916',
            bgClass: 'bg-pink-500'
        },
        'indigo': {
            name: 'indigo',
            main: '#2563eb',
            hover: '#1d4ed8',
            light: '#eff6ff',
            shadow: 'rgba(37, 99, 235, 0.28)',
            ring: 'rgba(37, 99, 235, 0.45)',
            canvas: '#f8fafc',
            canvasDark: '#0b0f19',
            bgClass: 'bg-indigo-600'
        },
        'blue': {
            name: 'indigo',
            main: '#2563eb',
            hover: '#1d4ed8',
            light: '#eff6ff',
            shadow: 'rgba(37, 99, 235, 0.28)',
            ring: 'rgba(37, 99, 235, 0.45)',
            canvas: '#f8fafc',
            canvasDark: '#0b0f19',
            bgClass: 'bg-indigo-600'
        },
        'purple': {
            name: 'purple',
            main: '#9333ea',
            hover: '#7e22ce',
            light: '#faf5ff',
            shadow: 'rgba(147, 51, 234, 0.28)',
            ring: 'rgba(147, 51, 234, 0.45)',
            canvas: '#faf5ff',
            canvasDark: '#120c1f',
            bgClass: 'bg-purple-600'
        },
        'emerald': {
            name: 'emerald',
            main: '#059669',
            hover: '#047857',
            light: '#ecfdf5',
            shadow: 'rgba(5, 150, 105, 0.28)',
            ring: 'rgba(5, 150, 105, 0.45)',
            canvas: '#f0fdf4',
            canvasDark: '#071510',
            bgClass: 'bg-emerald-600'
        },
        'rose': {
            name: 'rose',
            main: '#e11d48',
            hover: '#be123c',
            light: '#fff1f2',
            shadow: 'rgba(225, 29, 72, 0.28)',
            ring: 'rgba(225, 29, 72, 0.45)',
            canvas: '#fff5f5',
            canvasDark: '#1a0b0e',
            bgClass: 'bg-rose-600'
        }
    };

    let currentAccentKey = localStorage.getItem("meetly_accent_color") || "pink";

    function applyAccentColor(accentKey) {
        const pal = ACCENT_COLORS[accentKey] || ACCENT_COLORS.pink;
        currentAccentKey = pal.name;

        // 1. Set CSS root variables so the entire application updates instantly
        document.documentElement.style.setProperty('--theme-accent', pal.main);
        document.documentElement.style.setProperty('--theme-accent-hover', pal.hover);
        document.documentElement.style.setProperty('--theme-accent-light', pal.light);
        document.documentElement.style.setProperty('--theme-accent-shadow', pal.shadow);
        document.documentElement.style.setProperty('--theme-accent-ring', pal.ring);
        document.documentElement.style.setProperty('--theme-canvas', pal.canvas);
        document.documentElement.style.setProperty('--theme-canvas-dark', pal.canvasDark);
        document.documentElement.setAttribute('data-accent', pal.name);
        if (document.body) {
            document.body.setAttribute('data-accent', pal.name);
        }

        // 2. Update active rings and checkmark icon on color buttons
        document.querySelectorAll(".avatar-color-btn").forEach(btn => {
            const colorAttr = btn.getAttribute("data-color");
            const isMatch = (colorAttr === pal.name) || (colorAttr === "indigo" && pal.name === "indigo") || (colorAttr === "blue" && pal.name === "indigo");
            if (isMatch) {
                btn.style.outline = `3px solid ${pal.main}`;
                btn.style.outlineOffset = "2px";
                btn.innerHTML = `<svg class="w-3.5 h-3.5 text-white mx-auto flex items-center justify-center" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`;
            } else {
                btn.style.outline = "none";
                btn.innerHTML = "";
            }
        });

        // 3. Immediately update avatar preview, topnav avatar, and sidebar avatar
        const displayName = document.getElementById("settingDisplayName")?.value?.trim() || "User";
        const initial = (displayName || "U")[0].toUpperCase();

        const avatars = [
            document.getElementById("settingsAvatarPreview"),
            document.getElementById("headerUserAvatar"),
            document.getElementById("sidebarUserAvatar")
        ];
        avatars.forEach(av => {
            if (av) {
                av.style.backgroundColor = pal.main;
                av.innerHTML = `<span>${initial}</span>`;
            }
        });

        const names = [
            document.getElementById("headerUserName"),
            document.getElementById("sidebarUserName")
        ];
        names.forEach(n => {
            if (n) n.textContent = displayName;
        });

        // 4. Update audio scrubber accent color
        const audioScrubber = document.getElementById("audioScrubber");
        if (audioScrubber) {
            audioScrubber.style.accentColor = pal.main;
        }

        // 5. Re-render charts
        if (typeof window._refreshMeetingActivityChart === "function") {
            window._refreshMeetingActivityChart();
        }

        // 6. Save immediately to localStorage
        localStorage.setItem("meetly_accent_color", pal.name);
    }

    // Color buttons event binding
    document.querySelectorAll(".avatar-color-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const colorAttr = btn.getAttribute("data-color");
            if (colorAttr) {
                applyAccentColor(colorAttr);
            }
        });
    });

    // Settings Horizontal Pill Tab Switcher (Open Full Screen Layout)
    const settingsTabBtns = document.querySelectorAll(".settings-tab-btn");
    const settingsPanels = {
        profile: document.getElementById("settingsPanelProfile"),
        preferences: document.getElementById("settingsPanelPreferences"),
        ai: document.getElementById("settingsPanelAi"),
        account: document.getElementById("settingsPanelAccount")
    };

    function switchSettingsTab(tabKey) {
        settingsTabBtns.forEach(btn => {
            const key = btn.getAttribute("data-settings-tab");
            if (key === tabKey) {
                btn.className = "settings-tab-btn theme-pill active inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer";
            } else {
                btn.className = "settings-tab-btn text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer";
            }
        });

        Object.entries(settingsPanels).forEach(([key, panel]) => {
            if (panel) {
                if (key === tabKey) {
                    panel.classList.remove("hidden");
                } else {
                    panel.classList.add("hidden");
                }
            }
        });
    }

    settingsTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.getAttribute("data-settings-tab");
            if (key) switchSettingsTab(key);
        });
    });

    // Expandable Change Email Actions
    const openChangeEmailBtn = document.getElementById("openChangeEmailBtn");
    const changeEmailBox = document.getElementById("changeEmailBox");
    const cancelChangeEmailBtn = document.getElementById("cancelChangeEmailBtn");
    const confirmChangeEmailBtn = document.getElementById("confirmChangeEmailBtn");
    const settingNewEmail = document.getElementById("settingNewEmail");
    const settingEmail = document.getElementById("settingEmail");

    if (openChangeEmailBtn && changeEmailBox) {
        openChangeEmailBtn.addEventListener("click", () => {
            changeEmailBox.classList.toggle("hidden");
            if (settingNewEmail) settingNewEmail.focus();
        });
    }
    if (cancelChangeEmailBtn && changeEmailBox) {
        cancelChangeEmailBtn.addEventListener("click", () => {
            changeEmailBox.classList.add("hidden");
        });
    }
    if (confirmChangeEmailBtn && settingNewEmail && settingEmail) {
        confirmChangeEmailBtn.addEventListener("click", async () => {
            const val = settingNewEmail.value.trim();
            if (!val || !val.includes("@")) {
                alert("Please enter a valid email address.");
                return;
            }
            try {
                const res = await fetch("/api/user/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: val })
                });
                const data = await res.json();
                if (res.ok && data.status === "success") {
                    settingEmail.value = val;
                    changeEmailBox.classList.add("hidden");
                    settingNewEmail.value = "";
                    alert("Email address updated and saved successfully.");
                } else {
                    alert(data.message || "Failed to update email.");
                }
            } catch (e) {
                alert("Error connecting to server. Please try again.");
            }
        });
    }

    // Expandable Change Password Actions
    const openChangePasswordBtn = document.getElementById("openChangePasswordBtn");
    const changePasswordBox = document.getElementById("changePasswordBox");
    const cancelChangePasswordBtn = document.getElementById("cancelChangePasswordBtn");
    const confirmChangePasswordBtn = document.getElementById("confirmChangePasswordBtn");
    const settingCurrentPassword = document.getElementById("settingCurrentPassword");
    const settingNewPassword = document.getElementById("settingNewPassword");

    if (openChangePasswordBtn && changePasswordBox) {
        openChangePasswordBtn.addEventListener("click", () => {
            changePasswordBox.classList.toggle("hidden");
            if (settingCurrentPassword) settingCurrentPassword.focus();
        });
    }
    if (cancelChangePasswordBtn && changePasswordBox) {
        cancelChangePasswordBtn.addEventListener("click", () => {
            changePasswordBox.classList.add("hidden");
        });
    }
    if (confirmChangePasswordBtn) {
        confirmChangePasswordBtn.addEventListener("click", async () => {
            const cur = settingCurrentPassword ? settingCurrentPassword.value : "";
            const nxt = settingNewPassword ? settingNewPassword.value : "";
            if (!cur) {
                alert("Please enter your current password.");
                return;
            }
            if (!nxt || nxt.length < 6) {
                alert("New password must be at least 6 characters long.");
                return;
            }
            try {
                const res = await fetch("/api/user/password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_password: cur, new_password: nxt })
                });
                const data = await res.json();
                if (res.ok && data.status === "success") {
                    alert(data.message || "Password updated successfully.");
                    if (settingCurrentPassword) settingCurrentPassword.value = "";
                    if (settingNewPassword) settingNewPassword.value = "";
                    changePasswordBox.classList.add("hidden");
                } else {
                    alert(data.message || "Failed to update password.");
                }
            } catch (e) {
                alert("Error connecting to server. Please try again.");
            }
        });
    }

    // Download JSON Archive Backup
    const downloadAllDataBtn = document.getElementById("downloadAllDataBtn");
    if (downloadAllDataBtn) {
        downloadAllDataBtn.addEventListener("click", () => {
            const backupData = {
                user: {
                    name: document.getElementById("settingDisplayName")?.value || "User",
                    email: document.getElementById("settingEmail")?.value || "user@example.com",
                    organization: document.getElementById("settingOrganization")?.value || "ITM University"
                },
                meeting: prepareExportPayload(),
                exportDate: new Date().toISOString(),
                version: "2.0.0"
            };
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "meetly_archive_backup.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        });
    }



    // Settings Controls and Elements References
    const settingDisplayName = document.getElementById("settingDisplayName");
    const settingPhoneCountry = document.getElementById("settingPhoneCountry");
    const settingPhoneNumber = document.getElementById("settingPhoneNumber");
    const settingJobTitle = document.getElementById("settingJobTitle");
    const settingOrganization = document.getElementById("settingOrganization");
    const settingTimezone = document.getElementById("settingTimezone");

    const settingTheme = document.getElementById("settingTheme");
    const settingLanguage = document.getElementById("settingLanguage");
    const settingAutoScroll = document.getElementById("settingAutoScroll");
    const settingSoundAlerts = document.getElementById("settingSoundAlerts");
    const settingDefaultExport = document.getElementById("settingDefaultExport");
    const settingTimeFormat = document.getElementById("settingTimeFormat");

    const settingSummaryLength = document.getElementById("settingSummaryLength");
    const settingExtractDecisions = document.getElementById("settingExtractDecisions");
    const settingActionSensitivity = document.getElementById("settingActionSensitivity");
    const settingDiscussionPointsCount = document.getElementById("settingDiscussionPointsCount");
    const settingShowTimestamps = document.getElementById("settingShowTimestamps");

    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const settingsToast = document.getElementById("settingsToast");
    const clearMeetingHistoryBtn = document.getElementById("clearMeetingHistoryBtn");

    function loadSavedSettings() {
        try {
            const saved = localStorage.getItem("meetly_workspace_settings");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.name && settingDisplayName) settingDisplayName.value = parsed.name;
                if (parsed.email && settingEmail) settingEmail.value = parsed.email;
                if (parsed.phoneCountry && settingPhoneCountry) settingPhoneCountry.value = parsed.phoneCountry;
                if (parsed.phoneNumber && settingPhoneNumber) settingPhoneNumber.value = parsed.phoneNumber;
                if (parsed.jobTitle && settingJobTitle) settingJobTitle.value = parsed.jobTitle;
                if (parsed.organization && settingOrganization) settingOrganization.value = parsed.organization;
                if (parsed.timezone && settingTimezone) settingTimezone.value = parsed.timezone;

                if (parsed.theme && settingTheme) settingTheme.value = parsed.theme;
                if (parsed.language && settingLanguage) settingLanguage.value = parsed.language;
                if (typeof parsed.autoScroll === "boolean" && settingAutoScroll) settingAutoScroll.checked = parsed.autoScroll;
                if (typeof parsed.soundAlerts === "boolean" && settingSoundAlerts) settingSoundAlerts.checked = parsed.soundAlerts;
                if (parsed.exportFormat && settingDefaultExport) settingDefaultExport.value = parsed.exportFormat;
                if (parsed.timeFormat && settingTimeFormat) settingTimeFormat.value = parsed.timeFormat;

                if (parsed.summaryLength && settingSummaryLength) settingSummaryLength.value = parsed.summaryLength;
                if (typeof parsed.extractDecisions === "boolean" && settingExtractDecisions) settingExtractDecisions.checked = parsed.extractDecisions;
                if (parsed.actionSensitivity && settingActionSensitivity) settingActionSensitivity.value = parsed.actionSensitivity;
                if (parsed.discussionPointsCount && settingDiscussionPointsCount) settingDiscussionPointsCount.value = parsed.discussionPointsCount;
                if (typeof parsed.showTimestamps === "boolean" && settingShowTimestamps) settingShowTimestamps.checked = parsed.showTimestamps;

                if (parsed.accentColor) {
                    currentAccentKey = parsed.accentColor;
                }
            }
            applyAccentColor(currentAccentKey);
        } catch (e) {
            console.error("Failed to load saved settings:", e);
        }
    }

    // Instant theme mode switching (Light / Dark / System Default)
    if (settingTheme) {
        settingTheme.addEventListener("change", () => {
            const val = settingTheme.value;
            if (val === "dark") {
                document.documentElement.classList.add("dark");
                localStorage.setItem("theme", "dark");
            } else if (val === "light") {
                document.documentElement.classList.remove("dark");
                localStorage.setItem("theme", "light");
            } else {
                if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                    document.documentElement.classList.add("dark");
                } else {
                    document.documentElement.classList.remove("dark");
                }
                localStorage.removeItem("theme");
            }
            if (typeof window._refreshMeetingActivityChart === "function") {
                window._refreshMeetingActivityChart();
            }
        });
    }

    // Dynamic OS System Theme listener for System Default setting
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (!localStorage.getItem("theme")) {
            if (e.matches) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
            if (typeof window._refreshMeetingActivityChart === "function") {
                window._refreshMeetingActivityChart();
            }
        }
    });

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener("click", () => {
            const settings = {
                name: settingDisplayName ? settingDisplayName.value.trim() : "User",
                email: settingEmail ? settingEmail.value.trim() : "user@example.com",
                phoneCountry: settingPhoneCountry ? settingPhoneCountry.value : "+91",
                phoneNumber: settingPhoneNumber ? settingPhoneNumber.value.trim() : "",
                jobTitle: settingJobTitle ? settingJobTitle.value.trim() : "",
                organization: settingOrganization ? settingOrganization.value.trim() : "",
                timezone: settingTimezone ? settingTimezone.value : "Asia/Kolkata",

                theme: settingTheme ? settingTheme.value : "system",
                language: settingLanguage ? settingLanguage.value : "English",
                autoScroll: settingAutoScroll ? settingAutoScroll.checked : true,
                soundAlerts: settingSoundAlerts ? settingSoundAlerts.checked : true,
                exportFormat: settingDefaultExport ? settingDefaultExport.value : "pdf",
                timeFormat: settingTimeFormat ? settingTimeFormat.value : "mmss",

                summaryLength: settingSummaryLength ? settingSummaryLength.value : "balanced",
                extractDecisions: settingExtractDecisions ? settingExtractDecisions.checked : true,
                actionSensitivity: settingActionSensitivity ? settingActionSensitivity.value : "balanced",
                discussionPointsCount: settingDiscussionPointsCount ? settingDiscussionPointsCount.value : "5",
                showTimestamps: settingShowTimestamps ? settingShowTimestamps.checked : true,
                accentColor: currentAccentKey
            };

            localStorage.setItem("meetly_workspace_settings", JSON.stringify(settings));
            applyAccentColor(currentAccentKey);

            if (settings.theme === "dark") {
                document.documentElement.classList.add("dark");
                localStorage.setItem("theme", "dark");
            } else if (settings.theme === "light") {
                document.documentElement.classList.remove("dark");
                localStorage.setItem("theme", "light");
            } else {
                if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                    document.documentElement.classList.add("dark");
                } else {
                    document.documentElement.classList.remove("dark");
                }
                localStorage.removeItem("theme");
            }

            if (settingsToast) {
                settingsToast.classList.remove("hidden");
                setTimeout(() => {
                    settingsToast.classList.add("hidden");
                }, 3000);
            }

            // Sync user name to backend profile if changed
            if (settingDisplayName) {
                const newName = settingDisplayName.value.trim();
                fetch("/api/user/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newName })
                }).then(res => res.json()).then(data => {
                    if (data && data.status === "success" && data.user) {
                        const headerName = document.getElementById("headerUserName");
                        if (headerName) headerName.textContent = data.user.name;
                        const sidebarName = document.getElementById("sidebarUserName");
                        if (sidebarName) sidebarName.textContent = data.user.name;
                    }
                }).catch(() => {});
            }
        });
    }

    const runAiDiagnosticBtn = document.getElementById("runAiDiagnosticBtn");
    const aiDiagnosticResult = document.getElementById("aiDiagnosticResult");
    if (runAiDiagnosticBtn) {
        runAiDiagnosticBtn.addEventListener("click", async () => {
            runAiDiagnosticBtn.disabled = true;
            if (aiDiagnosticResult) aiDiagnosticResult.textContent = "Connecting to Whisper and Summarizer models...";
            const start = performance.now();
            try {
                const res = await fetch("/api/ai-status");
                const data = await res.json();
                const latency = Math.round(performance.now() - start);
                if (data.status === "success" && data.overall_status === "operational") {
                    if (aiDiagnosticResult) {
                        aiDiagnosticResult.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">&check; AI Pipeline 100% Operational (${latency}ms)</span> &bull; Faster-Whisper & Summarizer ready.`;
                    }
                } else {
                    if (aiDiagnosticResult) {
                        aiDiagnosticResult.innerHTML = `<span class="text-amber-500 font-semibold">&bull; AI Status: ${data.overall_status}</span>`;
                    }
                }
            } catch (err) {
                if (aiDiagnosticResult) {
                    aiDiagnosticResult.innerHTML = `<span class="text-rose-500 font-semibold">&cross; Diagnostic failed to reach server.</span>`;
                }
            } finally {
                runAiDiagnosticBtn.disabled = false;
            }
        });
    }

    if (clearMeetingHistoryBtn) {
        clearMeetingHistoryBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear your local meeting cache?")) {
                localStorage.setItem(_getMeetingsKey(), JSON.stringify([]));
                renderDashboardMetrics();
                if (typeof window.renderMeetingsList === "function") window.renderMeetingsList("", "all");
                alert("Local meeting cache cleared successfully. Dashboard reset to empty state.");
            }
        });
    }

    try {
        loadSavedSettings();
    } catch (e) {
        console.error("Error loading saved settings:", e);
    }

    // Navigation and Multi-View Switcher (Desktop sidebar and Mobile bottom tab bar)
    const VIEW_HASH_MAP = {
        viewDashboard: "dashboard",
        viewMeetings: "meetings",
        viewWorkspace: "workspace",
        viewAnalytics: "analytics",
        viewSettings: "settings"
    };

    const HASH_VIEW_MAP = {
        dashboard: "viewDashboard",
        meetings: "viewMeetings",
        workspace: "viewWorkspace",
        analytics: "viewAnalytics",
        settings: "viewSettings"
    };

    function switchView(targetViewId, updateHash = true) {
        if (!targetViewId) return;

        // 1. Hide all dashboard views and display the target view
        document.querySelectorAll(".dashboard-view").forEach(v => {
            if (v.id === targetViewId) {
                v.classList.remove("hidden");
            } else {
                v.classList.add("hidden");
            }
        });

        // 2. Inner workspace nav visibility
        const workspaceInnerBackNav = document.getElementById("workspaceInnerBackNav");
        if (workspaceInnerBackNav) {
            workspaceInnerBackNav.style.display = "none";
        }

        // 3. Update the Top Bar Title dynamically
        const viewTitles = {
            viewDashboard: "Dashboard",
            viewMeetings: "Meetings",
            viewWorkspace: "Upload Meeting",
            viewAnalytics: "Analytics",
            viewSettings: "Settings"
        };
        const topNavTitle = document.getElementById("topNavViewTitle");
        if (topNavTitle && viewTitles[targetViewId]) {
            topNavTitle.textContent = viewTitles[targetViewId];
        }

        // 4. Update Sidebar navigation items - highlight target in active blue and clear others
        document.querySelectorAll(".sidebar-nav-item[data-view]").forEach(item => {
            const viewAttr = item.getAttribute("data-view");
            if (viewAttr === targetViewId) {
                item.classList.add("active");
                item.classList.remove("text-slate-600", "dark:text-slate-400");
            } else {
                item.classList.remove("active");
                item.classList.add("text-slate-600", "dark:text-slate-400");
            }
        });

        // 5. Persist view in localStorage and URL hash
        try {
            localStorage.setItem("meetly_active_view", targetViewId);
            if (updateHash && VIEW_HASH_MAP[targetViewId]) {
                const targetHash = `#${VIEW_HASH_MAP[targetViewId]}`;
                if (window.location.hash !== targetHash) {
                    history.replaceState(null, "", targetHash);
                }
            }
        } catch (e) {}

        if (targetViewId === "viewDashboard") {
            renderDashboardMetrics();
            if (window._refreshMeetingActivityChart) {
                setTimeout(window._refreshMeetingActivityChart, 50);
            }
        } else if (targetViewId === "viewAnalytics") {
            renderAnalyticsView();
        }

        // Auto-close mobile drawer if open
        closeMobileSidebar();

        window.scrollTo({ top: 0, behavior: "instant" });
    }

    // Mobile Sidebar Drawer Controller
    const mobileSidebarToggleBtn = document.getElementById("mobileSidebarToggleBtn");
    const closeMobileSidebarBtn = document.getElementById("closeMobileSidebarBtn");
    const mainAppSidebar = document.getElementById("mainAppSidebar");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");

    function openMobileSidebar() {
        if (mainAppSidebar) mainAppSidebar.classList.remove("-translate-x-full");
        if (sidebarBackdrop) sidebarBackdrop.classList.remove("hidden");
    }

    function closeMobileSidebar() {
        if (mainAppSidebar) mainAppSidebar.classList.add("-translate-x-full");
        if (sidebarBackdrop) sidebarBackdrop.classList.add("hidden");
    }

    if (mobileSidebarToggleBtn) mobileSidebarToggleBtn.addEventListener("click", openMobileSidebar);
    if (closeMobileSidebarBtn) closeMobileSidebarBtn.addEventListener("click", closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeMobileSidebar);

    // Dynamic Analytics View Renderer
    async function renderAnalyticsView() {
        const totalMeetingsEl = document.getElementById("analyticsTotalMeetings");
        const timeSavedEl = document.getElementById("analyticsTimeSaved");
        const completionRateEl = document.getElementById("analyticsCompletionRate");
        const completionSubEl = document.getElementById("analyticsCompletionSub");
        const tasksTotalBadge = document.getElementById("analyticsTasksTotalBadge");
        const tasksOpenVal = document.getElementById("analyticsTasksOpenVal");
        const tasksOpenBar = document.getElementById("analyticsTasksOpenBar");
        const tasksCompletedVal = document.getElementById("analyticsTasksCompletedVal");
        const tasksCompletedBar = document.getElementById("analyticsTasksCompletedBar");
        const tasksPendingVal = document.getElementById("analyticsTasksPendingVal");
        const tasksPendingBar = document.getElementById("analyticsTasksPendingBar");
        const daysContainer = document.getElementById("analyticsDaysDistribution");

        try {
            const res = await fetch("/api/analytics");
            if (!res.ok) throw new Error("Failed to load analytics");
            const data = await res.json();
            
            const total = data.total_meetings || 0;
            const actions = data.action_items || { open: 0, completed: 0, pending: 0 };
            const sumActions = (actions.open || 0) + (actions.completed || 0) + (actions.pending || 0);
            const compRate = sumActions > 0 ? ((actions.completed / sumActions) * 100).toFixed(1) : "0.0";
            
            // Estimated time saved: avg 45 mins (0.75 hr) per meeting
            const timeSaved = (total * 0.75).toFixed(1);

            if (totalMeetingsEl) totalMeetingsEl.textContent = total;
            if (timeSavedEl) timeSavedEl.textContent = `${timeSaved} hrs`;
            if (completionRateEl) completionRateEl.textContent = `${compRate}%`;
            if (completionSubEl) completionSubEl.textContent = `${actions.completed || 0} of ${sumActions} deliverables completed`;
            if (tasksTotalBadge) tasksTotalBadge.textContent = `${sumActions} Total`;

            const openPct = sumActions > 0 ? ((actions.open / sumActions) * 100).toFixed(1) : 0;
            const compPct = sumActions > 0 ? ((actions.completed / sumActions) * 100).toFixed(1) : 0;
            const pendPct = sumActions > 0 ? ((actions.pending / sumActions) * 100).toFixed(1) : 0;

            if (tasksOpenVal) tasksOpenVal.textContent = `${actions.open || 0} (${openPct}%)`;
            if (tasksOpenBar) tasksOpenBar.style.width = `${openPct}%`;
            if (tasksCompletedVal) tasksCompletedVal.textContent = `${actions.completed || 0} (${compPct}%)`;
            if (tasksCompletedBar) tasksCompletedBar.style.width = `${compPct}%`;
            if (tasksPendingVal) tasksPendingVal.textContent = `${actions.pending || 0} (${pendPct}%)`;
            if (tasksPendingBar) tasksPendingBar.style.width = `${pendPct}%`;

            if (daysContainer && Array.isArray(data.activity)) {
                daysContainer.innerHTML = "";
                const maxCount = Math.max(1, ...data.activity.map(a => a.meetings || 0));
                data.activity.forEach(d => {
                    const count = d.meetings || 0;
                    const heightPct = Math.max(18, Math.round((count / maxCount) * 100));
                    const col = document.createElement("div");
                    col.className = "flex flex-col items-center gap-2";
                    col.innerHTML = `
                        <div class="w-full bg-slate-100 dark:bg-slate-800/80 rounded-xl h-28 flex items-end justify-center p-1.5 border border-slate-200/50 dark:border-slate-800">
                            <div class="w-full bg-pink-600 rounded-lg transition-all duration-500 shadow-xs flex items-center justify-center text-[10px] text-white font-bold" style="height: ${heightPct}%;">
                                ${count > 0 ? count : ''}
                            </div>
                        </div>
                        <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">${d.day}</span>
                    `;
                    daysContainer.appendChild(col);
                });
            }
        } catch (e) {
            console.warn("Analytics fetch error:", e);
        }
    }

    const refreshAnalyticsBtn = document.getElementById("refreshAnalyticsBtn");
    if (refreshAnalyticsBtn) {
        refreshAnalyticsBtn.addEventListener("click", renderAnalyticsView);
    }

    // Expose switchView globally for external triggers
    window.switchView = switchView;

    // Delegated click listener ensures sidebar navigation works reliably
    document.addEventListener("click", (e) => {
        const navBtn = e.target.closest(".sidebar-nav-item[data-view]");
        if (navBtn) {
            e.preventDefault();
            const target = navBtn.getAttribute("data-view");
            if (target) {
                switchView(target);
                if (target === "viewWorkspace") {
                    const btnText = (navBtn.textContent || "").trim().toLowerCase();
                    if (btnText.includes("upload") && window.resetNewMeetingWorkspace) {
                        window.resetNewMeetingWorkspace();
                    } else {
                        const savedMeetingRaw = localStorage.getItem("meetly_active_meeting");
                        if (savedMeetingRaw && window.renderTwoPanelWorkspace) {
                            try {
                                window.renderTwoPanelWorkspace(JSON.parse(savedMeetingRaw));
                            } catch(err) {}
                        }
                    }
                }
            }
        }
    });

    const dashboardNewMeetingBtn = document.getElementById("dashboardNewMeetingBtn");
    if (dashboardNewMeetingBtn) {
        dashboardNewMeetingBtn.addEventListener("click", () => {
            switchView("viewWorkspace");
            if (window.resetNewMeetingWorkspace) window.resetNewMeetingWorkspace();
        });
    }

    document.querySelectorAll(".switch-to-upload-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            switchView("viewWorkspace");
            if (window.resetNewMeetingWorkspace) window.resetNewMeetingWorkspace();
        });
    });

    // Load sample meeting data for instant review across English, Hindi, and Hinglish
    function loadDemoMeeting(lang = "english") {
        window._isDemoModeActive = true;
        window._activeDemoLang = lang;
        switchView("viewWorkspace");
        fetch(`/api/demo?lang=${encodeURIComponent(lang)}`)
            .then(res => res.json())
            .then(result => {
                if (result.status === "success") {
                    const data = result.data;
                    data.is_demo = true;
                    if (window.renderTwoPanelWorkspace) {
                        window.renderTwoPanelWorkspace(data);
                    }
                    const minutesOutputContainer = document.getElementById("minutesOutputContainer");
                    if (minutesOutputContainer) {
                        minutesOutputContainer.style.display = "block";
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                }
            })
            .catch(console.error);
    }

    document.querySelectorAll(".recent-meeting-item").forEach(item => {
        item.addEventListener("click", () => {
            switchView("viewWorkspace");
            loadDemoMeeting();
        });
    });

    // Restore exact view from URL hash or localStorage upon browser refresh
    function restoreActiveView() {
        const rawHash = (window.location.hash || "").replace("#", "").toLowerCase();
        const savedView = HASH_VIEW_MAP[rawHash] || localStorage.getItem("meetly_active_view") || "viewDashboard";
        
        switchView(savedView, false);

        if (savedView === "viewWorkspace") {
            const savedMeetingRaw = localStorage.getItem("meetly_active_meeting");
            if (savedMeetingRaw) {
                try {
                    const meeting = JSON.parse(savedMeetingRaw);
                    if (window.renderTwoPanelWorkspace) {
                        window.renderTwoPanelWorkspace(meeting);
                    }
                } catch (e) {
                    if (window.loadDemoMeeting) window.loadDemoMeeting();
                }
            } else {
                const stored = (window.getStoredMeetings) ? window.getStoredMeetings() : [];
                if (stored && stored.length > 0 && window.renderTwoPanelWorkspace) {
                    window.renderTwoPanelWorkspace(stored[0]);
                } else if (window.loadDemoMeeting) {
                    window.loadDemoMeeting();
                }
            }
        }
        if (urlParams.get("demo") === "1") {
            openDemoRecordingsModal();
        }
    }

    // Run active view restoration
    restoreActiveView();

    // Render dashboard metrics and charts immediately on initial boot
    renderDashboardMetrics();

    // Sync real meetings from SQLite backend on boot
    fetch("/api/meetings")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && Array.isArray(data.meetings)) {
                const clean = data.meetings.filter(m => !MOCK_IDS.includes(m.id) && !MOCK_TITLES.includes(m.title));
                localStorage.setItem(_getMeetingsKey(), JSON.stringify(clean));
                renderDashboardMetrics();
                if (typeof window.renderMeetingsList === "function") window.renderMeetingsList();
            }
        })
        .catch(() => {});

    window.addEventListener("hashchange", () => {
        const rawHash = (window.location.hash || "").replace("#", "").toLowerCase();
        if (HASH_VIEW_MAP[rawHash]) {
            switchView(HASH_VIEW_MAP[rawHash], false);
        }
    });


// Expose dashboard functions globally and on window.Meetly
    window.renderDashboardMetrics = renderDashboardMetrics;
    window.renderRecentActivity = renderRecentActivity;
    window.addActivityLog = addActivityLog;
    window.applyAccentColor = applyAccentColor;
    window.switchView = switchView;
    window.loadDemoMeeting = loadDemoMeeting;
    window.openDemoRecordingsModal = openDemoRecordingsModal;
    window.closeDemoRecordingsModal = closeDemoRecordingsModal;
    window.switchSettingsTab = switchSettingsTab;
    window.getMeetingActivityDemoData = getMeetingActivityDemoData;
    window.renderMeetingActivityChart = renderMeetingActivityChart;
    window.getActionItemsData = getActionItemsData;
    window.renderActionItemsBreakdown = renderActionItemsBreakdown;

    window.Meetly.renderDashboardMetrics = renderDashboardMetrics;
    window.Meetly.renderRecentActivity = renderRecentActivity;
    window.Meetly.addActivityLog = addActivityLog;
    window.Meetly.applyAccentColor = applyAccentColor;
    window.Meetly.switchView = switchView;
    window.Meetly.loadDemoMeeting = loadDemoMeeting;
    window.Meetly.openDemoRecordingsModal = openDemoRecordingsModal;
    window.Meetly.closeDemoRecordingsModal = closeDemoRecordingsModal;
    window.Meetly.switchSettingsTab = switchSettingsTab;
    window.Meetly.getMeetingActivityDemoData = getMeetingActivityDemoData;
    window.Meetly.renderMeetingActivityChart = renderMeetingActivityChart;
    window.Meetly.getActionItemsData = getActionItemsData;
    window.Meetly.renderActionItemsBreakdown = renderActionItemsBreakdown;
});
